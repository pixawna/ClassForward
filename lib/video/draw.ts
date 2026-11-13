import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Resvg } from "@resvg/resvg-js";
import path from "node:path";
import { claudeConfig } from "./config";
import type { Character } from "./types";

/*
 * Claude draws each scene as an SVG in ClassForward's hand-drawn style,
 * then resvg turns it into an image for the video.
 */

export const CANVAS = { width: 1600, height: 900 };

// Bumping this redraws every scene at the next render.
export const STYLE_VERSION = "notebook-1";

const FONT_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "assets", "video-fonts");
const FONT_FILES = ["Schoolbell-Regular.ttf", "AtkinsonHyperlegible-Regular.ttf", "AtkinsonHyperlegible-Bold.ttf"].map((f) =>
  path.join(FONT_DIR, f),
);

const STYLE_GUIDE = `You illustrate one scene of an educational story video for ClassForward, in its hand-drawn notebook style.

Canvas: start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"> and fill the whole canvas with a background.

Style
- Flat colors with thick dark-navy outlines: stroke="#1F2A44", stroke-width 4 to 6, stroke-linecap="round", stroke-linejoin="round".
- Simple, friendly, rounded shapes, like a confident marker drawing. Uncluttered backgrounds.
- Palette: paper #F7F5EF, ink #1F2A44, red pen #D93A2B, chalkboard #2F4F43, chalk #EEEBE2, sky #CFE8F7, water #9CCDEB, sun #F6D77A, leaf #7DBE7A, wood #C99E70, plum #8E7CC3. Skin tones: #F0C49B, #E8B48C, #C68B5E, #8D5A3B.
- Draw every character exactly as the character sheet describes, same shapes and colors in every scene, so students recognize them.
- Diagrams are welcome when they explain the idea: arrows, cutaways, simple labeled parts.

Text
- At most six short labels, four words or fewer each, in font-family="Schoolbell" at font-size 40 to 64.
- Never write sentences or the narration on screen.
- Keep the bottom 150px free of labels and key details: captions appear there.

Rules
- Use only: svg, g, defs, rect, circle, ellipse, line, polyline, polygon, path, text, tspan, linearGradient, radialGradient, stop, clipPath.
- No script, style or foreignObject elements, no image elements, no links or external references, no event attributes, no animation.
- Keep it under 20,000 characters.
- Reply with the SVG markup only.`;

function characterSheet(characters: Character[]) {
  return characters.map((c) => `- ${c.name} (${c.role}): ${c.look}`).join("\n");
}

export type DrawRequest = {
  storyTitle: string;
  characters: Character[];
  chapter: string;
  title: string;
  visual: string;
  narration: string;
  sceneNumber: number;
  sceneCount: number;
};

/** What a drawing was made from. A scene is redrawn only when this changes. */
export function drawingKey(req: DrawRequest): string {
  return JSON.stringify([STYLE_VERSION, req.visual, req.characters]);
}

const ALLOWED = new Set([
  "svg", "g", "defs", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan",
  "lineargradient", "radialgradient", "stop", "clippath", "title", "desc",
]);

export class DrawingError extends Error {}

/** Keeps only plain drawing markup: no scripts, links, images or event handlers. */
export function cleanSvg(raw: string): string {
  const match = raw.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) throw new DrawingError("The reply had no SVG in it.");
  const svg = match[0];
  for (const tag of svg.matchAll(/<\/?\s*([a-zA-Z][\w:-]*)/g)) {
    if (!ALLOWED.has(tag[1].toLowerCase())) throw new DrawingError(`It used a <${tag[1]}> element, which isn't allowed.`);
  }
  if (/\son[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)|@import/i.test(svg)) {
    throw new DrawingError("It referred to something outside the drawing, which isn't allowed.");
  }
  return svg;
}

/** Renders an SVG to a PNG. Throws if resvg can't read it. */
export function rasterize(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "#F7F5EF",
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Atkinson Hyperlegible" },
  });
  return resvg.render().asPng();
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** A chalkboard title card, used when a drawing can't be made. */
export function titleCard(chapter: string, title: string): string {
  const lines = wrap(title, 26);
  const startY = 450 - (lines.length - 1) * 45;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
  <rect width="1600" height="900" fill="#C99E70"/>
  <rect x="60" y="60" width="1480" height="740" rx="18" fill="#2F4F43" stroke="#1F2A44" stroke-width="8"/>
  <text x="800" y="250" text-anchor="middle" font-family="Schoolbell" font-size="52" fill="#F6D77A">${escapeXml(chapter)}</text>
  ${lines
    .map(
      (l, i) =>
        `<text x="800" y="${startY + i * 90}" text-anchor="middle" font-family="Schoolbell" font-size="84" fill="#EEEBE2">${escapeXml(l)}</text>`,
    )
    .join("\n  ")}
  <rect x="1180" y="812" width="70" height="16" rx="6" fill="#EEEBE2"/>
  <rect x="1270" y="812" width="50" height="16" rx="6" fill="#F6D77A"/>
</svg>`;
}

export type DrawScene = (req: DrawRequest) => Promise<{ svg: string; fallback: boolean }>;

export const drawScene: DrawScene = async (req) => {
  const { apiKey, model } = claudeConfig();
  const client = new Anthropic({ apiKey });
  // The style guide and character sheet are the same for every scene: cache them.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: STYLE_GUIDE },
    {
      type: "text",
      text: `Story: ${req.storyTitle}\n\nCharacter sheet:\n${characterSheet(req.characters)}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Scene ${req.sceneNumber} of ${req.sceneCount}. Chapter: ${req.chapter}. Scene: ${req.title}.

Draw this:
${req.visual}

(What the narrator says meanwhile, for context only, not to be written on screen: ${req.narration})`,
    },
  ];

  for (let attempt = 1; attempt <= 2; attempt++) {
    let text = "";
    try {
      const message = await client.messages.stream({ model, max_tokens: 16000, system, messages }).finalMessage();
      text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const svg = cleanSvg(text);
      rasterize(svg, 320); // make sure it renders before keeping it
      return { svg, fallback: false };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new DrawingError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.");
      }
      if (err instanceof Anthropic.NotFoundError) {
        throw new DrawingError("The model set in CLAUDE_MODEL isn't available to this API key. Check it in .env.local.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new DrawingError("Too many drawing requests right now. Wait a minute and render again; finished scenes are kept.");
      }
      if (attempt === 2) break;
      const reason = err instanceof Error ? err.message : "It couldn't be rendered.";
      if (text) {
        messages.push(
          { role: "assistant", content: text },
          { role: "user", content: `That drawing can't be used: ${reason} Please send a corrected SVG that follows the rules.` },
        );
      }
    }
  }
  return { svg: titleCard(req.chapter, req.title), fallback: true };
};

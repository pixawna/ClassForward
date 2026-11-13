import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Lesson, SavedSource } from "../lessons";
import { claudeConfig } from "./config";
import type { Story } from "./store";
import { formatDuration } from "../lesson-limits";
import { WORDS_PER_MINUTE, wordCount } from "./types";

/*
 * Claude turns a lesson into a story: a problem, characters who face it, and
 * the explanation that solves it, written as narrated scenes grouped into
 * named chapters. Every scene is tied to one of the lesson's objectives.
 */

/** How long one scene stays on screen, so a 30-minute lesson isn't 60 drawings. */
function secondsPerScene(seconds: number) {
  if (seconds <= 5 * 60) return 30;
  if (seconds <= 15 * 60) return 45;
  return 60;
}

/**
 * The shape of the story for a lesson length (in seconds). Every objective
 * needs its own scene, so there are never fewer scenes than objectives.
 * A clip under 30 seconds can be a single scene.
 */
export function storyPlan(seconds: number, objectiveCount = 1) {
  const words = Math.round((seconds / 60) * WORDS_PER_MINUTE);
  const fewest = seconds < 30 ? 1 : 2;
  const scenes = Math.max(fewest, objectiveCount, Math.round(seconds / secondsPerScene(seconds)));
  const chapters =
    seconds < 30 ? "1" : seconds < 60 ? "1 or 2" : seconds <= 2 * 60 ? "2 or 3" : seconds <= 10 * 60 ? "3 to 5" : "4 to 7";
  return { words, scenes, chapters, wordsPerScene: Math.round(words / scenes) };
}

// Structured outputs: Claude's reply is guaranteed to match this shape.
// (Counts and ranges aren't expressible here, so checkStory() enforces them.)
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "logline", "problem", "explanation", "characters", "chapters"],
  properties: {
    title: { type: "string", description: "Title of the video lesson, a few words." },
    logline: { type: "string", description: "One sentence: who faces what problem, and what they'll learn solving it." },
    problem: { type: "string", description: "The problem the characters face. The lesson's ideas are what solve it." },
    explanation: {
      type: "string",
      description: "Two to four plain sentences summarizing the subject matter the story explains, accurately.",
    },
    characters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "look"],
        properties: {
          name: { type: "string" },
          role: { type: "string", description: "Their part in the story." },
          look: {
            type: "string",
            description: "Exact visual description for an illustrator: shape, colors, clothing or accessories. Reused in every scene.",
          },
        },
      },
    },
    chapters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "scenes"],
        properties: {
          title: { type: "string", description: "Short chapter name, 2 to 5 words." },
          scenes: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "narration", "visual", "objective"],
              properties: {
                title: { type: "string", description: "Short scene name." },
                narration: { type: "string", description: "Exactly what the narrator says during this scene." },
                visual: {
                  type: "string",
                  description: "One illustration: setting, which characters, what they do, any simple labeled diagram.",
                },
                objective: { type: "integer", description: "Number of the learning objective this scene serves (1-based)." },
              },
            },
          },
        },
      },
    },
  },
} as const;

type RawStory = {
  title: string;
  logline: string;
  problem: string;
  explanation: string;
  characters: { name: string; role: string; look: string }[];
  chapters: { title: string; scenes: { title: string; narration: string; visual: string; objective: number }[] }[];
};

const LEVEL_AUDIENCE = {
  high_school: "high-school students (ages 14 to 18)",
  college: "college undergraduates",
} as const;

function systemPrompt() {
  return `You write story-driven video lessons for ClassForward. A teacher gives you a lesson; you turn it into a short narrated story that teaches it.

Story
- Open on a problem the characters care about. The lesson's ideas are what let them solve it.
- Weave the explanation into the story: characters notice, ask, test, get things wrong, and figure it out. End with the problem solved and a short recap of what was learned.
- Characters are original (never characters from existing books, films, games or brands). One to three of them.
- Build on what students already know; don't re-teach it. If the teacher mentions misconceptions, have a character hold one and correct it.
- Be accurate. Use the numbered sources for facts. Don't invent statistics, quotes, dates or studies. If something is uncertain, leave it out.

Script
- One narrator reads every scene. Characters may speak inside the narration ("Mia frowned. 'So where did the water go?'").
- Write for the ear: short sentences, everyday words for the level, no markdown, lists, emojis, stage directions or citations read aloud.
- Each scene's visual describes a single illustration a hand-drawn style can show: the setting, which characters and what they're doing, and simple diagrams with at most six short labels. Never put sentences on screen.
- Every scene serves exactly one learning objective (its number). Every objective gets at least one scene.
- Chapter titles are short names a student could navigate by.`;
}

function userPrompt(lesson: Lesson, sources: SavedSource[]) {
  const plan = storyPlan(lesson.durationSeconds, lesson.objectives.length);
  const objectives = lesson.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n");
  const sourceList = sources.length
    ? sources
        .map((s, i) => `[${i + 1}] ${s.title} (${s.site}) ${s.url}${s.description ? `\n    ${s.description}` : ""}`)
        .join("\n")
    : "(The teacher hasn't saved sources. Stick to well-established facts.)";
  return `Lesson topic: ${lesson.topic}
Audience: ${LEVEL_AUDIENCE[lesson.level]}
Length: ${formatDuration(lesson.durationSeconds)} of narration, about ${plan.words} words in total.${lesson.durationSeconds < 60 ? " This is a very short video: state the problem in a sentence and get straight to the explanation." : ""}
Shape: ${plan.chapters} ${plan.chapters === "1" ? "chapter" : "chapters"} and about ${plan.scenes} ${plan.scenes === 1 ? "scene" : "scenes"}, roughly ${plan.wordsPerScene} words of narration each.

What students already know:
${lesson.priorKnowledge}

Learning objectives:
${objectives}

Sources the teacher saved:
${sourceList}`;
}

export class StoryError extends Error {}

/** Problems with a draft, in words Claude (and a teacher) can act on. Empty when it's usable. */
export function checkStory(raw: RawStory, lesson: Lesson): string[] {
  const problems: string[] = [];
  const scenes = raw.chapters.flatMap((c) => c.scenes);
  const count = lesson.objectives.length;
  if (scenes.length === 0) problems.push("The storyboard has no scenes.");
  for (const [i, s] of scenes.entries()) {
    if (!Number.isInteger(s.objective) || s.objective < 1 || s.objective > count) {
      problems.push(`Scene ${i + 1} ("${s.title}") names objective ${s.objective}, but there are only ${count}.`);
    }
    if (!s.narration.trim()) problems.push(`Scene ${i + 1} ("${s.title}") has no narration.`);
  }
  const covered = new Set(scenes.map((s) => s.objective));
  for (let n = 1; n <= count; n++) {
    if (!covered.has(n)) problems.push(`No scene teaches objective ${n}: "${lesson.objectives[n - 1]}".`);
  }
  const words = scenes.reduce((sum, s) => sum + wordCount(s.narration), 0);
  const target = storyPlan(lesson.durationSeconds).words;
  if (words < target * 0.6 || words > target * 1.5) {
    problems.push(`The narration is ${words} words; ${formatDuration(lesson.durationSeconds)} of narration is about ${target}.`);
  }
  return problems;
}

function toStory(raw: RawStory): Story {
  return {
    title: raw.title.trim(),
    logline: raw.logline.trim(),
    problem: raw.problem.trim(),
    explanation: raw.explanation.trim(),
    characters: raw.characters.map((c) => ({ name: c.name.trim(), role: c.role.trim(), look: c.look.trim() })),
    scenes: raw.chapters.flatMap((chapter) =>
      chapter.scenes.map((s) => ({
        chapter: chapter.title.trim(),
        title: s.title.trim(),
        narration: s.narration.trim(),
        visual: s.visual.trim(),
        objective: s.objective - 1,
      })),
    ),
  };
}

function explainApiError(err: unknown): never {
  if (err instanceof Anthropic.AuthenticationError) {
    throw new StoryError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    throw new StoryError("Too many story requests right now. Wait a minute and try again.");
  }
  if (err instanceof Anthropic.NotFoundError) {
    throw new StoryError("The model set in CLAUDE_MODEL isn't available to this API key. Check it in .env.local.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    throw new StoryError("Couldn't reach the story writer. Check your internet connection and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    throw new StoryError(`ClassForward couldn't write the story (${err.status ?? "error"}). Try again in a moment.`);
  }
  throw err;
}

export type WriteStory = (lesson: Lesson, sources: SavedSource[]) => Promise<{ story: Story; model: string }>;

export const writeStory: WriteStory = async (lesson, sources) => {
  const { apiKey, model } = claudeConfig();
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(lesson, sources) }];

  // One retry: if the first draft misses an objective or the length, Claude gets the list of problems.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let message: Anthropic.Message;
    try {
      message = await client.messages
        .stream({
          model,
          max_tokens: 32000,
          system: systemPrompt(),
          messages,
          output_config: { format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
        })
        .finalMessage();
    } catch (err) {
      explainApiError(err);
    }
    if (message.stop_reason === "refusal") {
      throw new StoryError("ClassForward couldn't write a story for this lesson. Try rewording the topic or objectives.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new StoryError("The story ran too long to finish. Try a shorter lesson length.");
    }
    const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    const raw = JSON.parse(text) as RawStory;
    const problems = checkStory(raw, lesson);
    if (problems.length === 0) return { story: toStory(raw), model };
    if (attempt === 2) {
      throw new StoryError(`The storyboard still needs work: ${problems.join(" ")} Write the story again.`);
    }
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `Please fix these problems and return the whole storyboard again:\n- ${problems.join("\n- ")}` },
    );
  }
  throw new StoryError("ClassForward couldn't write the story.");
};

import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { captionCues, chaptersFfmetadata, chaptersVtt, toSrt, toVtt, type Chapter, type Cue, type TimedWord } from "./captions";
import { ffmpegPath } from "./config";
import { drawingKey, drawScene, rasterize, type DrawScene } from "./draw";
import { finishRender, saveDrawing, saveRecording, sceneRows, setProgress, type SceneRow } from "./store";
import type { Video } from "./types";
import { narrate, recordingKey, type Narrate, type Word } from "./voice";

/*
 * Rendering a story video:
 *   1. Claude draws each scene (skipped when the drawing is still current)
 *   2. ElevenLabs records each scene's narration, with word timings
 *   3. ffmpeg animates each drawing (slow zoom or pan) under its narration
 *   4. Captions and chapter marks come from the measured timings
 *   5. ffmpeg joins the scenes into one MP4 with a caption track and chapters
 */

export const VIDEO_DIR = process.env.VIDEO_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "videos");

const FPS = 30;
const LEAD = 0.35; // seconds of quiet before each scene's narration
const TAIL = 0.65; // and after it
const OUT = { width: 1920, height: 1080 };
const SOURCE_WIDTH = 3200; // drawings are rendered larger than the video so the camera can move

export class RenderError extends Error {}

export type Providers = { draw: DrawScene; narrate: Narrate; drawingKey: typeof drawingKey; recordingKey: typeof recordingKey };

const realProviders: Providers = { draw: drawScene, narrate, drawingKey, recordingKey };

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-8000)));
    child.on("error", () => reject(new RenderError("ffmpeg couldn't start. Check FFMPEG_PATH, or run npm install.")));
    child.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else {
        console.error(`[video] ffmpeg exited with ${code}:\n${stderr}`);
        reject(new RenderError("ffmpeg couldn't assemble the video. The server log has the details."));
      }
    });
  });
}

/** Length of an audio file, read from ffmpeg's report. */
export async function mediaSeconds(file: string): Promise<number | null> {
  const report = await new Promise<string>((resolve) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", () => resolve(stderr));
    child.on("error", () => resolve(""));
  });
  const m = report.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** A slow camera move per scene, alternating so the video doesn't feel static. */
function cameraMove(index: number, frames: number) {
  const center = { x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
  switch (index % 4) {
    case 0:
      return { z: `1+0.07*on/${frames}`, ...center };
    case 1:
      return { z: `1.07-0.07*on/${frames}`, ...center };
    case 2:
      return { z: "1.07", x: `(iw-iw/zoom)*on/${frames}`, y: center.y };
    default:
      return { z: "1.07", x: `(iw-iw/zoom)*(1-on/${frames})`, y: center.y };
  }
}

export function sceneLength(audioSeconds: number) {
  const frames = Math.ceil((LEAD + audioSeconds + TAIL) * FPS);
  return { frames, seconds: frames / FPS };
}

async function sceneClip(png: string, audio: string, out: string, index: number, audioSeconds: number) {
  const { frames, seconds } = sceneLength(audioSeconds);
  const move = cameraMove(index, frames);
  const fade = 0.25;
  const leadMs = Math.round(LEAD * 1000);
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", png,
    "-i", audio,
    "-filter_complex",
    `[0:v]zoompan=z='${move.z}':x='${move.x}':y='${move.y}':d=${frames}:s=${OUT.width}x${OUT.height}:fps=${FPS},` +
      `fade=t=in:st=0:d=${fade},fade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade},format=yuv420p[v];` +
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${leadMs}|${leadMs},apad[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", seconds.toFixed(3),
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-c:a", "aac", "-b:a", "160k",
    out,
  ]);
  return seconds;
}

export async function renderVideo(video: Video, providers: Providers = realProviders): Promise<void> {
  const scriptVersion = video.scriptVersion;
  const dir = path.join(VIDEO_DIR, video.id);
  const work = path.join(dir, "work");
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  let rows = sceneRows(video.id);
  if (rows.length === 0) throw new RenderError("There are no scenes to render. Write the story first.");
  const total = rows.length;
  const storyTitle = video.title || "Story lesson";

  // 1. Drawings
  let done = 0;
  setProgress(video.id, { step: "Drawing the scenes", done, total });
  await mapLimit(rows, 3, async (row, i) => {
    const request = {
      storyTitle,
      characters: video.characters,
      chapter: row.chapter,
      title: row.title,
      visual: row.visual,
      narration: row.narration,
      sceneNumber: i + 1,
      sceneCount: total,
    };
    const key = providers.drawingKey(request);
    if (!(row.svg && row.svg_for === key)) {
      const { svg } = await providers.draw(request);
      saveDrawing(row.id, svg, key);
    }
    setProgress(video.id, { step: "Drawing the scenes", done: ++done, total });
  });

  // 2. Narration
  done = 0;
  setProgress(video.id, { step: "Recording the narration", done, total });
  await mapLimit(rows, 2, async (row, i) => {
    const key = providers.recordingKey(row.narration);
    const current = row.audio_file && row.audio_for === key && fs.existsSync(row.audio_file);
    if (!current) {
      const recording = await providers.narrate(row.narration, {
        previous: rows[i - 1]?.narration,
        next: rows[i + 1]?.narration,
      });
      const file = path.join(dir, "audio", `${row.id}-${hash(key)}.mp3`);
      fs.writeFileSync(file, recording.audio);
      const seconds = (await mediaSeconds(file)) ?? recording.seconds;
      saveRecording(row.id, { file, recordedFor: key, seconds, words: recording.words });
    }
    setProgress(video.id, { step: "Recording the narration", done: ++done, total });
  });

  // 3. Animated scenes
  rows = sceneRows(video.id);
  done = 0;
  setProgress(video.id, { step: "Animating the scenes", done, total });
  const clips: string[] = new Array(rows.length);
  const lengths: number[] = new Array(rows.length);
  await mapLimit(rows, 2, async (row, i) => {
    const png = path.join(work, `scene-${i}.png`);
    fs.writeFileSync(png, rasterize(row.svg!, SOURCE_WIDTH));
    clips[i] = path.join(work, `scene-${i}.mp4`);
    lengths[i] = await sceneClip(png, row.audio_file!, clips[i], i, row.audio_seconds ?? 0);
    fs.rmSync(png, { force: true });
    setProgress(video.id, { step: "Animating the scenes", done: ++done, total });
  });

  // 4. Captions and chapters, from where each scene starts
  setProgress(video.id, { step: "Adding captions and chapters", done: 0, total: 1 });
  const { cues, chapters, duration } = timeline(rows, lengths);
  fs.writeFileSync(path.join(work, "captions.srt"), toSrt(cues));
  fs.writeFileSync(path.join(work, "chapters.txt"), chaptersFfmetadata(storyTitle, chapters));
  fs.writeFileSync(path.join(work, "scenes.txt"), clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));

  // 5. One MP4: video, narration, a caption track and chapter marks
  const name = `lesson-v${scriptVersion}`;
  const output = path.join(dir, `${name}.mp4`);
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", path.join(work, "scenes.txt"),
    "-i", path.join(work, "captions.srt"),
    "-i", path.join(work, "chapters.txt"),
    "-map", "0:v", "-map", "0:a", "-map", "1:0",
    "-map_metadata", "2", "-map_chapters", "2",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-c:s", "mov_text",
    "-metadata:s:s:0", "language=eng", "-metadata:s:s:0", "title=English",
    "-movflags", "+faststart",
    output,
  ]);
  fs.writeFileSync(path.join(dir, `${name}.captions.vtt`), toVtt(cues));
  fs.writeFileSync(path.join(dir, `${name}.chapters.vtt`), chaptersVtt(chapters));

  // Tidy up: the work folder and videos from older versions of the script.
  fs.rmSync(work, { recursive: true, force: true });
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("lesson-v") && !f.startsWith(`${name}.`)) fs.rmSync(path.join(dir, f), { force: true });
  }
  finishRender(video.id, output, duration, scriptVersion);
}

/** Where each scene, caption and chapter falls in the finished video. */
export function timeline(rows: Pick<SceneRow, "chapter" | "words">[], lengths: number[]) {
  const cues: Cue[] = [];
  const chapters: Chapter[] = [];
  let at = 0;
  rows.forEach((row, i) => {
    const words = (JSON.parse(row.words || "[]") as Word[]).map<TimedWord>((w) => ({
      text: w.text,
      start: at + LEAD + w.start,
      end: at + LEAD + w.end,
    }));
    cues.push(...captionCues(words));
    if (chapters.at(-1)?.title !== row.chapter) {
      if (chapters.length) chapters[chapters.length - 1].end = at;
      chapters.push({ title: row.chapter, start: at, end: at });
    }
    at += lengths[i];
  });
  if (chapters.length) chapters[chapters.length - 1].end = at;
  return { cues, chapters, duration: at };
}

export function videoAssets(file: string) {
  const base = file.replace(/\.mp4$/, "");
  return { video: file, captions: `${base}.captions.vtt`, chapters: `${base}.chapters.vtt` };
}

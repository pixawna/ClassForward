// @vitest-environment node
/**
 * Renders a real MP4 with real resvg and ffmpeg. Claude and ElevenLabs are
 * replaced by stand-ins: hand-drawn SVGs from tests/fixtures, and a tone with
 * evenly spaced word timings, so this runs offline and costs nothing.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-video-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.VIDEO_DIR = path.join(tmp, "videos");
process.env.ELEVENLABS_API_KEY = "test";

type Mods = {
  lessons: typeof import("@/lib/lessons");
  store: typeof import("@/lib/video/store");
  render: typeof import("@/lib/video/render");
  draw: typeof import("@/lib/video/draw");
  config: typeof import("@/lib/video/config");
};
let m: Mods;

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

function ffprobe(file: string) {
  return spawnSync(m.config.ffmpegPath(), ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr;
}

function fakeProviders() {
  const draw = vi.fn(async (req: { title: string; chapter: string }) => {
    if (req.title.includes("evaporates")) return { svg: fixture("scene-evaporation.svg"), fallback: false };
    if (req.title.includes("window")) return { svg: fixture("scene-window.svg"), fallback: false };
    return { svg: m.draw.titleCard(req.chapter, req.title), fallback: true };
  });
  const narrate = vi.fn(async (text: string) => {
    const words = text.split(/\s+/);
    const seconds = words.length * 0.3;
    const file = path.join(tmp, `tone-${Math.random()}.mp3`);
    spawnSync(m.config.ffmpegPath(), [
      "-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=330:duration=${seconds}`, "-ac", "1", "-b:a", "64k", file,
    ]);
    return {
      audio: fs.readFileSync(file),
      seconds,
      words: words.map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25 })),
    };
  });
  return { draw, narrate, drawingKey: m.draw.drawingKey, recordingKey: (n: string) => `test:${n}` };
}

const story = {
  title: "Where did the puddle go?",
  logline: "Mia's puddle vanishes, and she sets out to find where the water went.",
  problem: "A puddle outside Mia's window disappears on a sunny day.",
  explanation: "The sun heats water, which evaporates into water vapor and later condenses into clouds.",
  characters: [{ name: "Mia", role: "curious student", look: "girl with dark curly hair, red sweater" }],
  scenes: [
    { chapter: "The vanishing puddle", title: "Mia at the window", narration: "Mia watched the rain fill a puddle outside her window.", visual: "Mia at a rainy window, puddle below", objective: 0 },
    { chapter: "The sun's secret", title: "Water evaporates", narration: "When the sun came out, it warmed the water. Tiny bits of it rose as water vapor.", visual: "Sun heating the sea, arrows rising as vapor", objective: 0 },
    { chapter: "The sun's secret", title: "Clouds form", narration: "High up, the vapor cooled and turned back into droplets. A cloud was born.", visual: "Cloud forming from vapor", objective: 1 },
  ],
};

beforeAll(async () => {
  m = {
    lessons: await import("@/lib/lessons"),
    store: await import("@/lib/video/store"),
    render: await import("@/lib/video/render"),
    draw: await import("@/lib/video/draw"),
    config: await import("@/lib/video/config"),
  };
});

describe("rendering a story video", () => {
  let lessonId: string;
  const providers = () => fakeProviders();

  it("writing the story again replaces the scenes instead of adding to them", () => {
    const lesson = m.lessons.createLesson("t@example.com", {
      topic: "The water cycle", level: "high_school", durationSeconds: 60, priorKnowledge: "States of matter.",
      objectives: ["Describe evaporation", "Explain condensation"],
    });
    lessonId = lesson.id;
    const video = m.store.markWriting(lessonId);
    m.store.saveStory(video.id, { ...story, scenes: [story.scenes[0]] }, "test-model");
    m.store.markWriting(lessonId);
    m.store.saveStory(video.id, story, "test-model");
    expect(m.store.listScenes(video.id)).toHaveLength(3);
    expect(m.store.getVideo(lessonId)?.status).toBe("draft");
  });

  it("renders an MP4 with narration, a caption track and named chapters", async () => {
    const p = providers();
    const video = m.store.getVideo(lessonId)!;
    m.store.markRendering(video.id);
    await m.render.renderVideo(m.store.getVideo(lessonId)!, p);

    const done = m.store.getVideo(lessonId)!;
    expect(done.status).toBe("ready");
    expect(done.renderedVersion).toBe(done.scriptVersion);
    expect(p.draw).toHaveBeenCalledTimes(3);
    expect(p.narrate).toHaveBeenCalledTimes(3);

    const file = m.store.videoFile(lessonId)!.file;
    const report = ffprobe(file);
    expect(report).toMatch(/Video: h264.*1920x1080/);
    expect(report).toMatch(/Audio: aac/);
    expect(report).toMatch(/Subtitle: mov_text/);
    expect(report).toMatch(/Chapter #0:0.*\n.*\n\s+title\s+: The vanishing puddle/);
    expect(report).toMatch(/Chapter #0:1.*\n.*\n\s+title\s+: The sun's secret/);

    const seconds = await m.render.mediaSeconds(file);
    expect(seconds).toBeGreaterThan(done.durationSeconds! - 0.3);
    expect(seconds).toBeLessThan(done.durationSeconds! + 0.3);

    const assets = m.render.videoAssets(file);
    const captions = fs.readFileSync(assets.captions, "utf8");
    expect(captions).toContain("Mia watched the rain fill a puddle");
    const chapters = fs.readFileSync(assets.chapters, "utf8");
    expect(chapters).toContain("The vanishing puddle");
    expect(chapters).toContain("The sun's secret");

    // A frame from the middle of the second scene, to look at.
    spawnSync(m.config.ffmpegPath(), ["-y", "-loglevel", "error", "-ss", "6", "-i", file, "-frames:v", "1", path.join(tmp, "frame.png")]);
    expect(fs.existsSync(path.join(tmp, "frame.png"))).toBe(true);
    console.log("rendered:", file, "frame:", path.join(tmp, "frame.png"));
  });

  it("re-rendering reuses drawings and recordings that are still current", async () => {
    const p = providers();
    await m.render.renderVideo(m.store.getVideo(lessonId)!, p);
    expect(p.draw).not.toHaveBeenCalled();
    expect(p.narrate).not.toHaveBeenCalled();
  });

  it("an edited scene is re-recorded, and only that one", async () => {
    const video = m.store.getVideo(lessonId)!;
    const scenes = m.store.listScenes(video.id);
    m.store.saveScript(video.id, {
      title: video.title!,
      scenes: scenes.map((s, i) => ({ ...s, narration: i === 1 ? `${s.narration} It happens every day.` : s.narration })),
    });
    const edited = m.store.getVideo(lessonId)!;
    expect(edited.scriptVersion).toBeGreaterThan(edited.renderedVersion!);

    const p = providers();
    await m.render.renderVideo(edited, p);
    expect(p.narrate).toHaveBeenCalledTimes(1);
    expect(p.draw).not.toHaveBeenCalled();
    const after = m.store.getVideo(lessonId)!;
    expect(after.renderedVersion).toBe(after.scriptVersion);
    // Only the newest video is kept.
    const files = fs.readdirSync(path.dirname(m.store.videoFile(lessonId)!.file)).filter((f) => f.endsWith(".mp4"));
    expect(files).toEqual([`lesson-v${after.scriptVersion}.mp4`]);
  });
});

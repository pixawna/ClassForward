// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { narrationProvider } from "@/lib/video/config";
import {
  captionCues,
  chaptersFfmetadata,
  toSrt,
  toVtt,
} from "@/lib/video/captions";
import { cleanSvg, DrawingError, titleCard } from "@/lib/video/draw";
import { checkStory, storyPlan } from "@/lib/video/story";
import { chaptersOf } from "@/lib/video/types";
import { wordsFrom, narrate, recordingKey } from "@/lib/video/voice";
import type { Lesson } from "@/lib/lessons";

const lesson: Lesson = {
  id: "l1",
  teacherEmail: "t@example.com",
  topic: "The water cycle",
  level: "high_school",
  durationSeconds: 120,
  priorKnowledge: "States of matter.",
  objectives: ["Describe evaporation", "Explain condensation"],
  createdAt: "",
  updatedAt: "",
};

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("story plan and checks", () => {
  it("scales scenes with the lesson length", () => {
    expect(storyPlan(10)).toMatchObject({
      words: 23,
      scenes: 1,
      chapters: "1",
    });
    expect(storyPlan(30)).toMatchObject({
      words: 70,
      scenes: 2,
      chapters: "1 or 2",
    });
    // More time never means fewer scenes.
    const counts = [10, 20, 30, 40, 50, 60, 90, 120, 300, 600, 1800].map(
      (s) => storyPlan(s).scenes,
    );
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(storyPlan(60).scenes).toBe(2);
    expect(storyPlan(5 * 60).scenes).toBe(10);
    expect(storyPlan(30 * 60).scenes).toBe(30);
    expect(storyPlan(30 * 60).words).toBe(4200);
  });

  it("gives every objective its own scene, even in a short video", () => {
    expect(storyPlan(10, 3).scenes).toBe(3);
    expect(storyPlan(5 * 60, 4).scenes).toBe(10);
  });

  it("accepts a storyboard that covers every objective at the right length", () => {
    const raw = {
      title: "t",
      logline: "l",
      problem: "p",
      explanation: "e",
      characters: [{ name: "Mia", role: "r", look: "x" }],
      chapters: [
        {
          title: "A puddle vanishes",
          scenes: [
            { title: "s1", narration: words(140), visual: "v", objective: 1 },
          ],
        },
        {
          title: "Clouds",
          scenes: [
            { title: "s2", narration: words(140), visual: "v", objective: 2 },
          ],
        },
      ],
    };
    expect(checkStory(raw, lesson)).toEqual([]);
  });

  it("names objectives that are missing or out of range, and a wrong length", () => {
    const raw = {
      title: "t",
      logline: "l",
      problem: "p",
      explanation: "e",
      characters: [],
      chapters: [
        {
          title: "c",
          scenes: [
            { title: "s1", narration: words(20), visual: "v", objective: 3 },
          ],
        },
      ],
    };
    const problems = checkStory(raw, lesson).join(" ");
    expect(problems).toContain("names objective 3, but there are only 2");
    expect(problems).toContain(
      'No scene teaches objective 1: "Describe evaporation"',
    );
    expect(problems).toContain("The narration is 20 words");
  });
});

describe("drawings", () => {
  it("keeps plain drawing markup", () => {
    const svg =
      '<svg viewBox="0 0 10 10"><g><rect width="10" height="10" fill="url(#g)"/><text>hi</text></g></svg>';
    expect(cleanSvg(`Here you go:\n${svg}\nDone`)).toBe(svg);
  });

  it.each([
    ["<svg><script>alert(1)</script></svg>", "script"],
    ['<svg><image href="https://x/y.png"/></svg>', "image"],
    ['<svg><rect onclick="x()"/></svg>', "outside"],
    ['<svg><rect fill="url(https://evil/x)"/></svg>', "outside"],
    ["<svg><foreignObject/></svg>", "foreignObject"],
    ["no svg here", "no SVG"],
  ])("refuses %s", (svg, why) => {
    expect(() => cleanSvg(svg)).toThrow(DrawingError);
    expect(() => cleanSvg(svg)).toThrow(why);
  });

  it("makes a safe title card when a drawing fails", () => {
    expect(
      cleanSvg(titleCard("Chapter <1>", "Where did the puddle go & why?")),
    ).toContain("&#60;1&#62;");
  });
});

describe("narration timings and captions", () => {
  const alignment = {
    characters: [..."Hi there. Bye"],
    character_start_times_seconds: [..."Hi there. Bye"].map((_, i) => i * 0.1),
    character_end_times_seconds: [..."Hi there. Bye"].map(
      (_, i) => i * 0.1 + 0.1,
    ),
  };

  it("groups character timings into words", () => {
    expect(wordsFrom(alignment).map((w) => w.text)).toEqual([
      "Hi",
      "there.",
      "Bye",
    ]);
    const there = wordsFrom(alignment)[1];
    expect(there.start).toBeCloseTo(0.3);
    expect(there.end).toBeCloseTo(0.9);
  });

  it("breaks captions at sentence ends and keeps lines short", () => {
    const ws =
      "The sun warms the sea. Water rises as an invisible gas called water vapor into the cool sky above us"
        .split(" ")
        .map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.25 }));
    const cues = captionCues(ws);
    expect(cues[0].text).toBe("The sun warms the sea.");
    expect(cues.every((c) => c.text.length <= 52)).toBe(true);
    // Sentences end on the same line as the words before them.
    expect(cues.some((c) => /^[a-z]+\.$/.test(c.text))).toBe(false);
    expect(cues.every((c, i) => i === 0 || c.start >= cues[i - 1].end)).toBe(
      true,
    );
    expect(toVtt(cues)).toMatch(/^WEBVTT\n\n1\n00:00:00\.000 --> /);
    expect(toSrt(cues)).toMatch(/^1\n00:00:00,000 --> /);
  });

  it("writes chapter metadata ffmpeg understands", () => {
    const meta = chaptersFfmetadata("Water; the story", [
      { title: "A=B", start: 0, end: 12.5 },
    ]);
    expect(meta).toContain(String.raw`;FFMETADATA1
title=Water\; the story`);
    expect(meta).toContain(String.raw`[CHAPTER]
TIMEBASE=1/1000
START=0
END=12500
title=A\=B`);
  });

  it("groups scenes into chapters in order", () => {
    const chapters = chaptersOf([
      { chapter: "A" },
      { chapter: "A" },
      { chapter: "B" },
      { chapter: "A" },
    ]);
    expect(chapters.map((c) => [c.title, c.scenes.length])).toEqual([
      ["A", 2],
      ["B", 1],
      ["A", 1],
    ]);
  });
});

describe("narration provider errors", () => {
  it("explains an API key ID rejection returned with HTTP 400", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key-id");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: "invalid_api_key",
              status: "api_key_id_used_as_api_key",
            },
          }),
          { status: 400 },
        ),
      ),
    );
    try {
      await expect(narrate("Water evaporates.", {})).rejects.toThrow(
        "secret API key, not the key ID",
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("local narration configuration", () => {
  it("uses a separate recording cache key without needing a cloud API key", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-piper-config-"));
    const model = path.join(dir, "voice.onnx");
    const python = path.join(dir, "python");
    fs.writeFileSync(model, "fixture");
    fs.writeFileSync(model + ".json", "{}");
    fs.writeFileSync(python, "fixture");
    vi.stubEnv("TTS_PROVIDER", "piper");
    vi.stubEnv("PIPER_MODEL", model);
    vi.stubEnv("PIPER_PYTHON", python);
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    try {
      expect(narrationProvider()).toBe("piper");
      expect(recordingKey("Water becomes vapor.")).toContain(
        "piper-sentence-v1",
      );
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("rejects unsupported narration providers instead of making a cloud request", () => {
    vi.stubEnv("TTS_PROVIDER", "unknown");
    try {
      expect(() => narrationProvider()).toThrow("piper or elevenlabs");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-edit-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.VIDEO_DIR = path.join(tmp, "videos");

let lessons: typeof import("@/lib/lessons");
let store: typeof import("@/lib/video/store");
let jobs: typeof import("@/lib/video/jobs");

beforeAll(async () => {
  lessons = await import("@/lib/lessons");
  store = await import("@/lib/video/store");
  jobs = await import("@/lib/video/jobs");
});

describe("moving scenes when objectives change", () => {
  const before = ["Describe evaporation", "Explain condensation", "Name the stages"];

  it("follows an objective that moved up when another was removed", () => {
    expect(lessons.objectiveMap(before, ["Describe evaporation", "Name the stages"])).toEqual([0, 0, 1]);
  });

  it("keeps an edited objective in its place", () => {
    expect(lessons.objectiveMap(before, ["Describe evaporation", "Explain how clouds form", "Name the stages"])).toEqual([0, 1, 2]);
  });

  it("follows objectives that were reordered", () => {
    expect(lessons.objectiveMap(before, ["Name the stages", "Describe evaporation", "Explain condensation"])).toEqual([1, 2, 0]);
  });

  it("sends objectives past the end of a shorter list to the last one", () => {
    expect(lessons.objectiveMap(before, ["Something new"])).toEqual([0, 0, 0]);
  });
});

describe("editing a lesson", () => {
  const details = {
    topic: "The water cycle",
    level: "high_school" as const,
    durationSeconds: 60,
    priorKnowledge: "States of matter.",
    objectives: ["Describe evaporation", "Explain condensation", "Name the stages"],
  };

  it("saves every field and keeps the lesson's id and sources", () => {
    const lesson = lessons.createLesson("t@example.com", details);
    lessons.saveSource(lesson.id, { url: "https://example.org/a", title: "A", description: null, relevance: null, foundVia: "link" });

    const changed = { ...details, topic: "Clouds", level: "college" as const, durationSeconds: 10, priorKnowledge: "Evaporation." };
    expect(lessons.updateLesson("t@example.com", lesson.id, changed)).toBe(true);

    const saved = lessons.getLesson("t@example.com", lesson.id)!;
    expect(saved).toMatchObject(changed);
    expect(lessons.listSources(lesson.id)).toHaveLength(1);
  });

  it("refuses another teacher's lesson", () => {
    const lesson = lessons.createLesson("t@example.com", details);
    expect(lessons.updateLesson("someone@example.com", lesson.id, { ...details, topic: "Hijacked" })).toBe(false);
    expect(lessons.getLesson("t@example.com", lesson.id)!.topic).toBe("The water cycle");
  });

  it("keeps the story's scenes on the same objectives and flags the story as written for old details", () => {
    const lesson = lessons.createLesson("t@example.com", details);
    const video = store.markWriting(lesson.id);
    const scene = (title: string, objective: number) => ({ chapter: "One", title, narration: "Words.", visual: "A drawing.", objective });
    store.saveStory(
      video.id,
      {
        title: "Puddles", logline: "", problem: "", explanation: "", characters: [],
        scenes: [scene("Evaporation", 0), scene("Condensation", 1), scene("Stages", 2)],
      },
      "test-model",
      lessons.lessonDetailsKey(lesson),
    );
    expect(jobs.storyOutdated(store.getVideo(lesson.id), lesson)).toBe(false);

    const edited = { ...details, objectives: ["Describe evaporation", "Name the stages"] };
    lessons.updateLesson("t@example.com", lesson.id, edited);

    expect(store.listScenes(video.id).map((s) => [s.title, s.objective])).toEqual([
      ["Evaporation", 0],
      ["Condensation", 0],
      ["Stages", 1],
    ]);
    const now = lessons.getLesson("t@example.com", lesson.id)!;
    expect(jobs.storyOutdated(store.getVideo(lesson.id), now)).toBe(true);
  });

  it("flags a story written before ClassForward tracked lesson details, once the lesson is edited", () => {
    const lesson = lessons.createLesson("t@example.com", details);
    const video = store.markWriting(lesson.id);
    store.saveStory(video.id, { title: "Old story", logline: "", problem: "", explanation: "", characters: [], scenes: [] }, "test-model");
    expect(jobs.storyOutdated(store.getVideo(lesson.id), lesson)).toBe(false);

    lessons.updateLesson("t@example.com", lesson.id, { ...details, durationSeconds: 120 });
    const now = lessons.getLesson("t@example.com", lesson.id)!;
    expect(jobs.storyOutdated(store.getVideo(lesson.id), now)).toBe(true);
  });
});

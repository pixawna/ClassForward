// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Quiz } from "@/lib/quiz/types";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-classroom-"));
process.env.DATABASE_PATH = path.join(temp, "test.db");
let lessons: typeof import("@/lib/lessons");
let store: typeof import("@/lib/quiz/store");
let notes: typeof import("@/lib/notes/store");
let db: typeof import("@/lib/db").db;
let id: string;
const quiz: Quiz = {
  title: "Water cycle",
  questions: [
    {
      id: "q1",
      type: "choice",
      prompt: "What powers evaporation?",
      objective: 0,
      options: ["Sun", "Moon"],
      answer: "Sun",
      explanation: "Solar energy heats the water.",
      rubric: "Identify sunlight.",
      misconception: "Water vanishes.",
      followUp: "Trace water as it becomes vapor.",
    },
    {
      id: "q2",
      type: "short",
      prompt: "Explain evaporation.",
      objective: 0,
      options: [],
      answer: "Liquid water becomes water vapor.",
      explanation: "Water changes state.",
      rubric: "Mention liquid and vapor.",
      misconception: "Water is destroyed.",
      followUp: "Imagine following one water molecule.",
    },
  ],
};
beforeAll(async () => {
  lessons = await import("@/lib/lessons");
  store = await import("@/lib/quiz/store");
  notes = await import("@/lib/notes/store");
  db = (await import("@/lib/db")).db;
  id = lessons.createLesson("teacher@example.com", {
    topic: "Water cycle",
    level: "high_school",
    durationSeconds: 60,
    priorKnowledge: "Water",
    objectives: ["Explain evaporation"],
  }).id;
});
afterAll(() => {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});
describe("classroom quiz", () => {
  it("checks ownership and rejects edits from stale tabs", () => {
    expect(() => store.saveQuiz("other@example.com", id, quiz, 0)).toThrow(
      "not found",
    );
    store.saveQuiz("teacher@example.com", id, quiz, 0);
    expect(() => store.saveQuiz("teacher@example.com", id, quiz, 0)).toThrow(
      "another tab",
    );
  });
  it("hides answer keys, prevents duplicate scoring, freezes questions and persists results", async () => {
    const code = store.createRoom("teacher@example.com", id, 1);
    const token = store.joinRoom(code, "Raindrops");
    store.control("teacher@example.com", code, "next", -1);
    const student = store.roomState(code, null, token);
    expect(student.question).not.toHaveProperty("answer");
    expect(student.question).not.toHaveProperty("rubric");
    expect(() => store.control("other@example.com", code, "reveal", 0)).toThrow(
      "not found",
    );
    await store.submit(code, token, "q1", "Sun");
    await expect(store.submit(code, token, "q1", "Sun")).rejects.toThrow(
      "already submitted",
    );
    expect(store.roomState(code, null, token).leaderboard[0].points).toBe(0);
    store.control("teacher@example.com", code, "reveal", 0);
    expect(store.roomState(code, null, token).question?.answer).toBe("Sun");
    expect(store.roomState(code, null, token).leaderboard[0].points).toBe(100);
    store.saveQuiz(
      "teacher@example.com",
      id,
      { ...quiz, title: "Edited later" },
      1,
    );
    expect(store.roomState(code, null, token).title).toBe("Water cycle");
    store.control("teacher@example.com", code, "next", 0);
    delete process.env.TYPESAFE_API_KEY;
    await store.submit(code, token, "q2", "Water becomes vapor.");
    const teacher = store.roomState(code, "teacher@example.com", "");
    const answer = teacher.answers.find((a) => a.question === "q2")!;
    expect(answer.evaluation.review).toBe(true);
    expect(answer.evaluation.points).toBe(0);
    store.control("teacher@example.com", code, "review", 1, answer.id, 100);
    store.control("teacher@example.com", code, "reveal", 1);
    store.control("teacher@example.com", code, "followup", 1);
    expect(store.roomState(code, null, token).followUp).toContain("molecule");
    store.control("teacher@example.com", code, "finish", 1);
    expect(store.roomState(code, null, token).leaderboard[0].points).toBe(200);
  });
  it("Jev routes uncertain output to review and keeps malformed responses unscored", async () => {
    const { evaluate } = await import("@/lib/quiz/jev");
    process.env.TYPESAFE_API_KEY = "test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "test-jev",
            answers: {
              understanding: { choice: "correct", confidence: 0.4 },
            },
          }),
        ),
      ),
    );
    expect((await evaluate(quiz.questions[1], "vapor")).review).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: { understanding: { choice: "invented", confidence: 1 } },
          }),
        ),
      ),
    );
    expect((await evaluate(quiz.questions[1], "vapor")).points).toBe(0);
    vi.unstubAllGlobals();
    delete process.env.TYPESAFE_API_KEY;
  });
});
describe("live concept summaries", () => {
  it("keeps low-confidence correct answers in the teacher review count", async () => {
    const code = store.createRoom("teacher@example.com", id, 2);
    const token = store.joinRoom(code, "Clouds");
    store.control("teacher@example.com", code, "next", -1);
    store.control("teacher@example.com", code, "reveal", 0);
    store.control("teacher@example.com", code, "next", 0);
    process.env.TYPESAFE_API_KEY = "test";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              answers: {
                understanding: { choice: "correct", confidence: 0.4 },
              },
            }),
          ),
        ),
    );
    try {
      await store.submit(code, token, "q2", "Water changes into vapor.");
      const state = store.roomState(code, "teacher@example.com", "");
      expect(state.concepts[1].needsHelp).toBe(1);
      expect(state.concepts[1].objectiveLabel).toBe("Explain evaporation");
      expect(state.recommendation).toContain("Review uncertain");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.TYPESAFE_API_KEY;
    }
  });
});

describe("notes and sharing", () => {
  it("enforces restricted verified identities and private revocation", async () => {
    const { canReadShare, shareSettings } = await import(
      "@/lib/notes/validation"
    );
    expect(
      canReadShare(
        "restricted",
        ["student@example.com"],
        "teacher@example.com",
        null,
      ),
    ).toBe(false);
    expect(
      canReadShare(
        "restricted",
        ["student@example.com"],
        "teacher@example.com",
        { email: "student@example.com", emailVerified: false },
      ),
    ).toBe(false);
    expect(
      canReadShare(
        "restricted",
        ["student@example.com"],
        "teacher@example.com",
        { email: "STUDENT@example.com", emailVerified: true },
      ),
    ).toBe(true);
    expect(
      canReadShare("private", [], "teacher@example.com", {
        email: "teacher@example.com",
        emailVerified: true,
      }),
    ).toBe(false);
    expect(() => shareSettings("restricted", [])).toThrow();
  });
  it("blocks publishing without a rendered matching video and rejects unauthorized notes", () => {
    expect(() => notes.notesState("other@example.com", id)).toThrow(
      "not found",
    );
    expect(() =>
      notes.publishNotes("teacher@example.com", id, 0, "anyone", []),
    ).toThrow();
  });
  it("rejects invented citations and invalid scene links", async () => {
    const { validateNotes } = await import("@/lib/notes/validation");
    const doc = {
      title: "Water",
      summary: ["Water changes state."],
      sections: [
        {
          title: "Evaporation",
          sceneId: "s1",
          explanation: "Liquid becomes vapor.",
          keyConcepts: [],
          definitions: [],
          examples: [],
          formulas: [],
          sourceIds: ["invented"],
        },
      ],
    };
    expect(() => validateNotes(doc, new Set(["s1"]), new Set())).toThrow(
      "citation",
    );
    expect(() =>
      validateNotes(
        { ...doc, sections: [{ ...doc.sections[0], sourceIds: [] }] },
        new Set(),
        new Set(),
      ),
    ).toThrow("scene");
  });
  it("publishes a media snapshot, applies recipient permissions, and revokes access", () => {
    const dir = path.join(temp, "rendered");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "lesson.mp4");
    fs.writeFileSync(file, "test-video-snapshot");
    process.env.SHARED_LESSON_DIR = path.join(temp, "shared");
    db.prepare(
      `INSERT INTO lesson_videos(id,lesson_id,status,script_version,rendered_version,video_file,created_at,updated_at) VALUES(?,?,'ready',1,1,?,?,?)`,
    ).run(
      "video",
      id,
      file,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO video_scenes(id,video_id,position,chapter,title,narration,visual,objective) VALUES('scene','video',0,'Evaporation','Liquid to vapor','Water becomes vapor.','A puddle.',0)`,
    ).run();
    const context = notes.notesContext("teacher@example.com", id);
    const document = {
      title: "Water",
      summary: ["Water changes state."],
      sections: [
        {
          title: "Evaporation",
          sceneId: "scene",
          explanation: "Liquid water becomes vapor.",
          keyConcepts: ["State change"],
          definitions: [],
          examples: [],
          formulas: [],
          sourceIds: [],
        },
      ],
    };
    notes.saveDraft("teacher@example.com", id, document, 0, context.basis);
    expect(() =>
      notes.saveDraft("teacher@example.com", id, document, 0, context.basis),
    ).toThrow("another tab");
    const published = notes.publishNotes(
      "teacher@example.com",
      id,
      1,
      "restricted",
      ["student@example.com"],
    );
    const token = published.sharing.token!;
    expect(notes.sharedLesson(token, null).status).toBe("signin");
    expect(
      notes.sharedLesson(token, {
        email: "other@example.com",
        emailVerified: true,
      }).status,
    ).toBe("denied");
    const allowed = notes.sharedLesson(token, {
      email: "student@example.com",
      emailVerified: true,
    });
    expect(allowed.status).toBe("allowed");
    fs.unlinkSync(file);
    if (allowed.status === "allowed")
      expect(fs.readFileSync(allowed.snapshot.video.file, "utf8")).toBe(
        "test-video-snapshot",
      );
    notes.changeSharing("teacher@example.com", id, "private", []);
    expect(
      notes.sharedLesson(token, {
        email: "student@example.com",
        emailVerified: true,
      }).status,
    ).toBe("missing");
  });
});

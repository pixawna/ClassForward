// @vitest-environment node
// Opt-in: uses the configured Anthropic account, never the application database.
import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
it.skipIf(process.env.CLASSFORWARD_LIVE_AI_TEST !== "1")(
  "generates validated notes and mixed quiz questions using the real provider",
  async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-live-materials-"));
    process.env.DATABASE_PATH = path.join(temp, "test.db");
    const { db } = await import("@/lib/db");
    try {
      const { createLesson } = await import("@/lib/lessons");
      const lesson = createLesson("live-test@example.com", {
        topic: "Evaporation",
        level: "high_school",
        durationSeconds: 60,
        priorKnowledge: "Water can be liquid.",
        objectives: ["Explain how liquid water becomes water vapor."],
      });
      db.prepare(
        `INSERT INTO lesson_videos(id,lesson_id,status,script_version,created_at,updated_at) VALUES(?,?,'draft',1,?,?)`,
      ).run(
        "test-video",
        lesson.id,
        new Date().toISOString(),
        new Date().toISOString(),
      );
      db.prepare(
        `INSERT INTO video_scenes(id,video_id,position,chapter,title,narration,visual,objective) VALUES('s1','test-video',0,'Evaporation','A puddle changes state','Sunlight heats a puddle. Some liquid water becomes water vapor and enters the air. The water is not destroyed: it changes state.','A puddle in sunshine.',0)`,
      ).run();
      const { generateNotes } = await import("@/lib/notes/generate");
      const notes = await generateNotes("live-test@example.com", lesson.id, 0);
      expect(notes.draft?.document.sections.length).toBeGreaterThan(0);
      expect(notes.draft?.document.sections[0].sceneId).toBe("s1");
      const { generateQuiz } = await import("@/lib/quiz/store");
      const quiz = await generateQuiz("live-test@example.com", lesson.id, 0);
      expect(quiz?.quiz.questions.some((q) => q.type === "choice")).toBe(true);
      expect(quiz?.quiz.questions.some((q) => q.type === "short")).toBe(true);
      console.log(
        JSON.stringify({
          liveNotesSections: notes.draft?.document.sections.length,
          liveQuizQuestions: quiz?.quiz.questions.length,
        }),
      );
    } finally {
      db.close();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  },
  180000,
);

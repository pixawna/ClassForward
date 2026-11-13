import "server-only";
import { quizSchema } from "../learning-schema";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { db } from "../db";
import { getLesson } from "../lessons";
import { notesContext } from "../notes/store";
import { learningJson } from "../learning-ai";
import { ClassroomError } from "../classroom-http";
import { validateQuiz } from "./validation";
import { evaluate } from "./jev";
import type { Evaluation, Quiz, Room } from "./types";
db.exec(`CREATE TABLE IF NOT EXISTS lesson_quizzes(lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE, document TEXT NOT NULL, revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_rooms(code TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, owner TEXT NOT NULL, quiz TEXT NOT NULL, phase TEXT NOT NULL, position INTEGER NOT NULL DEFAULT -1, follow_up TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_teams(id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES quiz_rooms(code) ON DELETE CASCADE, name TEXT NOT NULL, token TEXT NOT NULL, UNIQUE(room,name));
CREATE TABLE IF NOT EXISTS quiz_answers(id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES quiz_rooms(code) ON DELETE CASCADE, team TEXT NOT NULL REFERENCES quiz_teams(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT NOT NULL, evaluation TEXT NOT NULL, UNIQUE(room,team,question));`);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function ownQuiz(email: string, id: string) {
  if (!getLesson(email, id)) throw new ClassroomError("Lesson not found.", 404);
  return quizDraft(id);
}
export function quizDraft(id: string) {
  const r = db
    .prepare("SELECT * FROM lesson_quizzes WHERE lesson_id=?")
    .get(id) as { document: string; revision: number } | undefined;
  return r
    ? { quiz: JSON.parse(r.document) as Quiz, revision: r.revision }
    : null;
}
export function saveQuiz(
  email: string,
  id: string,
  quiz: unknown,
  revision: number,
) {
  return db.transaction(() => {
    const lesson = getLesson(email, id);
    if (!lesson) throw new ClassroomError("Lesson not found.", 404);
    if ((quizDraft(id)?.revision ?? 0) !== revision)
      throw new ClassroomError(
        "Quiz changed in another tab. Reload first.",
        409,
      );
    const checked = validateQuiz(quiz, lesson.objectives.length);
    db.prepare(
      "INSERT INTO lesson_quizzes VALUES(?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET document=excluded.document,revision=excluded.revision",
    ).run(id, JSON.stringify(checked), revision + 1);
    return quizDraft(id);
  })();
}
export async function generateQuiz(
  email: string,
  id: string,
  revision: number,
) {
  const ctx = notesContext(email, id);
  if (!ctx.scenes.length) throw new Error("Write the video script first.");
  const raw = await learningJson(
    `Return {title,questions:[{id,type,prompt,objective,options,answer,explanation,rubric,misconception,followUp}]}. Include at least one question for every objective (zero-based index). Use a mix of choice and short questions. Choice has 2-4 distinct options and answer is the exact correct option text. Short has options:[], a model answer, a specific rubric and likely misconception. Every question has a concrete alternative explanation or follow-up in followUp. Every question, including choice questions, must include a non-empty rubric, misconception, explanation and followUp. All fields are strings except objective (integer) and options (string array). Use unique string IDs such as q1, q2. Keep the quiz concise with 4-6 questions unless more are needed to cover every objective.`,
    { lesson: ctx.lesson, scenes: ctx.scenes, sources: ctx.sources },
    quizSchema,
  );
  return saveQuiz(email, id, raw, revision);
}
export function room(code: string) {
  const r = db
    .prepare("SELECT * FROM quiz_rooms WHERE code=?")
    .get(code.toUpperCase()) as Room | undefined;
  if (!r) throw new ClassroomError("Room not found.", 404);
  return r;
}
export function ownerRoom(email: string, code: string) {
  const r = room(code);
  if (r.owner !== email) throw new ClassroomError("Room not found.", 404);
  return r;
}
export function createRoom(email: string, id: string, revision: number) {
  const d = ownQuiz(email, id);
  if (!d || d.revision !== revision)
    throw new ClassroomError("Save and review the current quiz first.", 409);
  const lesson = getLesson(email, id)!;
  validateQuiz(d.quiz, lesson.objectives.length);
  const code = randomBytes(4).toString("hex").toUpperCase();
  db.prepare("INSERT INTO quiz_rooms VALUES(?,?,?,?,?,?,?,?)").run(
    code,
    id,
    email,
    JSON.stringify({ ...d.quiz, objectives: lesson.objectives }),
    "lobby",
    -1,
    null,
    new Date().toISOString(),
  );
  return code;
}
type Team = { id: string; name: string; token: string };
type AnswerRow = {
  id: string;
  team: string;
  question: string;
  answer: string;
  evaluation: string;
};
export function teamFor(code: string, token: string) {
  return db
    .prepare("SELECT * FROM quiz_teams WHERE room=? AND token=?")
    .get(code, hash(token)) as Team | undefined;
}
export function joinRoom(code: string, name: unknown) {
  const r = room(code);
  if (r.phase !== "lobby")
    throw new Error(
      "This room has already started. Ask the teacher to open a new room.",
    );
  if (typeof name !== "string" || !name.trim() || name.length > 60)
    throw new Error("Enter a team name up to 60 characters.");
  if (
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM quiz_teams WHERE room=?")
        .get(r.code) as { n: number }
    ).n >= 100
  )
    throw new Error("This room is full.");
  const token = randomBytes(32).toString("hex");
  try {
    db.prepare("INSERT INTO quiz_teams VALUES(?,?,?,?)").run(
      randomUUID(),
      r.code,
      name.trim(),
      hash(token),
    );
  } catch {
    throw new Error("That team name is taken. Choose another name.");
  }
  return token;
}
export async function submit(
  code: string,
  token: string,
  questionId: unknown,
  answer: unknown,
) {
  const r = room(code);
  const team = teamFor(r.code, token);
  if (!team) throw new ClassroomError("Join a team first.", 401);
  const q = (JSON.parse(r.quiz) as Quiz).questions[r.position];
  if (r.phase !== "question" || !q || q.id !== questionId)
    throw new ClassroomError("This question is closed.", 409);
  if (
    typeof answer !== "string" ||
    !answer.trim() ||
    answer.length > 4000 ||
    (q.type === "choice" && !q.options.includes(answer))
  )
    throw new Error("Enter a valid answer.");
  const id = randomUUID();
  const pending: Evaluation = {
    category: "unclear",
    confidence: null,
    review: true,
    points: 0,
    reason: "Evaluation pending.",
  };
  try {
    db.prepare("INSERT INTO quiz_answers VALUES(?,?,?,?,?,?)").run(
      id,
      r.code,
      team.id,
      q.id,
      answer,
      JSON.stringify(pending),
    );
  } catch {
    throw new ClassroomError(
      "Your team has already submitted this answer.",
      409,
    );
  }
  const evaluation = await evaluate(q, answer);
  db.prepare(
    "UPDATE quiz_answers SET evaluation=? WHERE id=? AND evaluation=?",
  ).run(JSON.stringify(evaluation), id, JSON.stringify(pending));
}
export function control(
  email: string,
  code: string,
  action: string,
  position: number,
  answerId?: string,
  points?: number,
) {
  return db.transaction(() => {
    const r = ownerRoom(email, code);
    const quiz = JSON.parse(r.quiz) as Quiz;
    if (action === "review") {
      if (![0, 50, 100].includes(points!))
        throw new Error("Choose 0, 50 or 100 points.");
      const row = db
        .prepare("SELECT * FROM quiz_answers WHERE id=? AND room=?")
        .get(answerId, r.code) as AnswerRow | undefined;
      if (!row) throw new Error("Answer not found.");
      const e = JSON.parse(row.evaluation) as Evaluation;
      db.prepare("UPDATE quiz_answers SET evaluation=? WHERE id=?").run(
        JSON.stringify({
          ...e,
          category:
            points === 100 ? "correct" : points === 50 ? "partial" : e.category,
          review: false,
          points,
          reason: "Reviewed by the teacher.",
        }),
        answerId,
      );
      return;
    }
    if (r.position !== position)
      throw new ClassroomError(
        "Room advanced in another tab. Refresh first.",
        409,
      );
    if (action === "next" && (r.phase === "lobby" || r.phase === "revealed")) {
      if (r.position + 1 >= quiz.questions.length)
        throw new Error("All questions are complete. Finish the room.");
      db.prepare(
        "UPDATE quiz_rooms SET position=position+1,phase='question',follow_up=NULL WHERE code=?",
      ).run(r.code);
    } else if (action === "reveal" && r.phase === "question")
      db.prepare("UPDATE quiz_rooms SET phase='revealed' WHERE code=?").run(
        r.code,
      );
    else if (
      action === "finish" &&
      r.phase === "revealed" &&
      r.position === quiz.questions.length - 1
    )
      db.prepare("UPDATE quiz_rooms SET phase='finished' WHERE code=?").run(
        r.code,
      );
    else if (action === "followup" && r.phase === "revealed")
      db.prepare("UPDATE quiz_rooms SET follow_up=? WHERE code=?").run(
        quiz.questions[r.position].followUp,
        r.code,
      );
    else
      throw new ClassroomError(
        "That action is unavailable in the current round.",
        409,
      );
  })();
}
export function roomState(code: string, email: string | null, token: string) {
  const r = room(code);
  const teacher = r.owner === email;
  const team = teamFor(r.code, token);
  const quiz = JSON.parse(r.quiz) as Quiz;
  const q = quiz.questions[r.position];
  const revealed = r.phase === "revealed" || r.phase === "finished";
  const teams = db
    .prepare("SELECT id,name FROM quiz_teams WHERE room=? ORDER BY name")
    .all(r.code) as Pick<Team, "id" | "name">[];
  const rows = db
    .prepare("SELECT * FROM quiz_answers WHERE room=?")
    .all(r.code) as AnswerRow[];
  const visibleRows = teacher
    ? rows
    : rows.filter(
        (a) =>
          a.team === team?.id &&
          (revealed ||
            quiz.questions.findIndex((q) => q.id === a.question) < r.position),
      );
  const leaderboard = teams
    .map((t) => ({
      name: t.name,
      points: rows
        .filter(
          (a) =>
            a.team === t.id &&
            (teacher ||
              revealed ||
              quiz.questions.findIndex((q) => q.id === a.question) <
                r.position),
        )
        .reduce(
          (sum, a) => sum + (JSON.parse(a.evaluation) as Evaluation).points,
          0,
        ),
    }))
    .sort((a, b) => b.points - a.points);
  const currentEvaluations = rows
    .filter((a) => a.question === q?.id)
    .map((a) => JSON.parse(a.evaluation) as Evaluation);
  const recommendation = !teacher
    ? null
    : currentEvaluations.some((e) => e.review)
      ? "Review uncertain judgments before deciding."
      : currentEvaluations.some((e) => e.category !== "correct")
        ? "Revisit this concept with the targeted follow-up."
        : currentEvaluations.length
          ? "Teams answered correctly. Consider moving to the next question."
          : "Wait for team responses.";
  return {
    recommendation,
    code: r.code,
    title: quiz.title,
    phase: r.phase,
    position: r.position,
    total: quiz.questions.length,
    teacher,
    team: team ? { id: team.id, name: team.name } : null,
    teams: teams.map((t) => ({ name: t.name })),
    submitted: rows.filter((a) => a.question === q?.id).length,
    hasSubmitted: rows.some((a) => a.team === team?.id && a.question === q?.id),
    question: q
      ? {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          ...(teacher || revealed
            ? {
                answer: q.answer,
                explanation: q.explanation,
                rubric: q.rubric,
                misconception: q.misconception,
                followUp: q.followUp,
                objective: q.objective,
              }
            : {}),
        }
      : null,
    answers: visibleRows.map((a) => ({
      ...a,
      teamName: teams.find((t) => t.id === a.team)?.name,
      evaluation: JSON.parse(a.evaluation) as Evaluation,
    })),
    leaderboard,
    followUp: r.follow_up,
    concepts: teacher
      ? quiz.questions.map((q) => ({
          question: q.prompt,
          objective: q.objective,
          objectiveLabel:
            quiz.objectives?.[q.objective] ||
            `Learning objective ${q.objective + 1}`,
          responses: rows.filter((a) => a.question === q.id).length,
          needsHelp: rows.filter(
            (a) =>
              a.question === q.id &&
              (JSON.parse(a.evaluation).review ||
                JSON.parse(a.evaluation).category !== "correct"),
          ).length,
        }))
      : [],
  };
}

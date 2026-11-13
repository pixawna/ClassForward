import type { Question, Quiz } from "./types";
export function validateQuiz(raw: unknown, objectiveCount: number): Quiz {
  if (!raw || typeof raw !== "object" || JSON.stringify(raw).length > 100000)
    throw new Error("Invalid quiz.");
  const q = raw as Quiz;
  if (
    typeof q.title !== "string" ||
    !q.title.trim() ||
    q.title.length > 250 ||
    !Array.isArray(q.questions) ||
    !q.questions.length ||
    q.questions.length > 30
  )
    throw new Error("Include a title and 1 to 30 questions.");
  const ids = new Set<string>();
  const text = (s: unknown, max = 4000): s is string =>
    typeof s === "string" && s.trim().length > 0 && s.length <= max;
  for (const item of q.questions) {
    if (
      !text(item.id, 100) ||
      ids.has(item.id) ||
      !text(item.prompt) ||
      !text(item.explanation) ||
      !text(item.answer) ||
      !text(item.rubric) ||
      !text(item.followUp) ||
      typeof item.misconception !== "string" ||
      item.misconception.length > 4000
    )
      throw new Error("Complete each question, answer, rubric and follow-up.");
    ids.add(item.id);
    if (
      !Number.isInteger(item.objective) ||
      item.objective < 0 ||
      item.objective >= objectiveCount
    )
      throw new Error("Link each question to a learning objective.");
    if (
      !Array.isArray(item.options) ||
      item.options.length > 6 ||
      item.options.some((s) => !text(s, 500))
    )
      throw new Error("Check question options.");
    if (item.type === "choice") {
      if (
        item.options.length < 2 ||
        new Set(item.options).size !== item.options.length ||
        !item.options.includes(item.answer)
      )
        throw new Error(
          "Choose one of the distinct options as the correct answer.",
        );
    } else if (item.type !== "short")
      throw new Error("Choose multiple choice or short explanation.");
  }
  const covered = new Set(q.questions.map((item: Question) => item.objective));
  if (covered.size !== objectiveCount)
    throw new Error("Include a question for every learning objective.");
  return q;
}

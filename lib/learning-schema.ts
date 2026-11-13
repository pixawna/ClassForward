// Keep provider output shapes strict; domain validation still checks citations,
// scene IDs, objective coverage and the teacher's answer keys before saving.
const string = { type: "string" };
const array = (items: Record<string, unknown>) => ({ type: "array", items });
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const notesSchema = object({
  title: string,
  summary: array(string),
  sections: array(
    object({
      title: string,
      sceneId: string,
      explanation: string,
      keyConcepts: array(string),
      definitions: array(object({ term: string, meaning: string })),
      examples: array(string),
      formulas: array(object({ expression: string, meaning: string })),
      sourceIds: array(string),
    }),
  ),
});
export const quizSchema = object({
  title: string,
  questions: array(
    object({
      id: string,
      type: { type: "string", enum: ["choice", "short"] },
      prompt: string,
      objective: { type: "integer" },
      options: array(string),
      answer: string,
      explanation: string,
      rubric: string,
      misconception: string,
      followUp: string,
    }),
  ),
});

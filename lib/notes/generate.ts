import "server-only";
import { notesSchema } from "../learning-schema";
import { notesContext, getDraft, saveDraft } from "./store";
import { learningJson } from "../learning-ai";
export async function generateNotes(
  email: string,
  id: string,
  expectedRevision: number,
) {
  const ctx = notesContext(email, id);
  if (!ctx.scenes.length)
    throw new Error(
      "Write the video script first so notes match what students hear.",
    );
  if ((getDraft(id)?.revision ?? 0) !== expectedRevision)
    throw new Error("Notes changed in another tab. Reload first.");
  const document = await learningJson(
    `Return {title, summary: string[], sections: [{title, sceneId, explanation, keyConcepts: string[], definitions: [{term,meaning}], examples: string[], formulas: [{expression,meaning}], sourceIds: string[]}]}. Cover every scene and objective. sceneId and sourceIds must be exact supplied IDs. Only cite sources supporting the section. Formulas can be empty. Explain ideas in detail and finish with a brief revision summary.`,
    { lesson: ctx.lesson, scenes: ctx.scenes, sources: ctx.sources },
    notesSchema,
  );
  return saveDraft(email, id, document, expectedRevision, ctx.basis);
}

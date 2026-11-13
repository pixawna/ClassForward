import {
  NotesError,
  type NotesDocument,
  type NoteSection,
  type ShareMode,
} from "./types";

function text(
  value: unknown,
  name: string,
  max: number,
  required = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new NotesError(`Check ${name}.`);
  return value.trim();
}
function list(value: unknown, name: string, max = 30): string[] {
  if (!Array.isArray(value) || value.length > max)
    throw new NotesError(`Check ${name}.`);
  return value.map((v) => text(v, name, 4000));
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new NotesError("The notes have an invalid format.");
  return value as Record<string, unknown>;
}
export function validateNotes(
  value: unknown,
  sceneIds: Set<string>,
  sourceIds: Set<string>,
): NotesDocument {
  if (JSON.stringify(value)?.length > 150_000)
    throw new NotesError(
      "These notes are too long. Shorten them before saving.",
    );
  const doc = record(value);
  if (
    !Array.isArray(doc.sections) ||
    !doc.sections.length ||
    doc.sections.length > 60
  )
    throw new NotesError("Include between 1 and 60 note sections.");
  const sections: NoteSection[] = doc.sections.map((v) => {
    const s = record(v);
    const sceneId = text(s.sceneId, "the linked scene", 100);
    if (!sceneIds.has(sceneId))
      throw new NotesError(
        "A linked scene no longer exists. Generate notes from the current script.",
      );
    const refs = list(s.sourceIds, "citations", 50);
    if (refs.some((id) => !sourceIds.has(id)))
      throw new NotesError(
        "A citation is no longer saved on this lesson. Update its citations.",
      );
    const pairs = (value: unknown, key: "term" | "expression") => {
      if (!Array.isArray(value) || value.length > 30)
        throw new NotesError("Check definitions and formulas.");
      return value.map((v) => {
        const r = record(v);
        return {
          [key]: text(r[key], key, 1000),
          meaning: text(r.meaning, "the explanation", 4000),
        };
      });
    };
    return {
      title: text(s.title, "the section title", 250),
      sceneId,
      explanation: text(s.explanation, "the explanation", 12_000),
      keyConcepts: list(s.keyConcepts, "key concepts"),
      examples: list(s.examples, "examples"),
      definitions: pairs(s.definitions, "term") as NoteSection["definitions"],
      formulas: pairs(s.formulas, "expression") as NoteSection["formulas"],
      sourceIds: [...new Set(refs)],
    };
  });
  const summary = list(doc.summary, "the revision summary", 20);
  if (!summary.length)
    throw new NotesError("Include a short revision summary.");
  return { title: text(doc.title, "the notes title", 250), summary, sections };
}
export function shareSettings(
  mode: unknown,
  value: unknown,
): { mode: ShareMode; emails: string[] } {
  if (mode !== "private" && mode !== "restricted" && mode !== "anyone")
    throw new NotesError("Choose a sharing option.");
  if (!Array.isArray(value) || value.length > 100)
    throw new NotesError("Share with at most 100 email addresses.");
  const emails = [
    ...new Set(
      value.map((v) => text(v, "an email address", 254).toLowerCase()),
    ),
  ];
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    throw new NotesError("Enter valid email addresses.");
  if (mode === "restricted" && !emails.length)
    throw new NotesError(
      "Add at least one email address for restricted sharing.",
    );
  return { mode, emails: mode === "restricted" ? emails : [] };
}
export function canReadShare(
  mode: ShareMode,
  emails: string[],
  ownerEmail: string,
  viewer: { email: string; emailVerified: boolean } | null,
) {
  if (mode === "private") return false;
  if (viewer?.email.toLowerCase() === ownerEmail.toLowerCase()) return true;
  return (
    mode === "anyone" ||
    Boolean(
      viewer?.emailVerified && emails.includes(viewer.email.toLowerCase()),
    )
  );
}

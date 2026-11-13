export type NoteSection = {
  title: string;
  sceneId: string;
  explanation: string;
  keyConcepts: string[];
  definitions: { term: string; meaning: string }[];
  examples: string[];
  formulas: { expression: string; meaning: string }[];
  sourceIds: string[];
};
export type NotesDocument = {
  title: string;
  summary: string[];
  sections: NoteSection[];
};
export type NoteCitation = { id: string; text: string; url: string };
export type NotesDraft = {
  document: NotesDocument;
  revision: number;
  basis: string;
  updatedAt: string;
};
export type ShareMode = "private" | "restricted" | "anyone";
export type Sharing = {
  mode: ShareMode;
  emails: string[];
  token: string | null;
  publishedAt: string | null;
  revision: number | null;
};
export type NotesState = {
  draft: NotesDraft | null;
  stale: boolean;
  hasScript: boolean;
  canPublish: boolean;
  scenes: { id: string; title: string; chapter: string }[];
  timestamps: Record<string, number>;
  citations: NoteCitation[];
  sharing: Sharing;
  videoVersion: number | null;
};
export type PublishedLesson = {
  topic: string;
  level: string;
  objectives: string[];
  document: NotesDocument;
  timestamps: Record<string, number>;
  citations: NoteCitation[];
  revision: number;
  video: { file: string; title: string; version: number };
  publishedAt: string;
};
export class NotesError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

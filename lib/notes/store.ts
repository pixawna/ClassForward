import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { getLesson, listSources } from "../lessons";
import { apaCitation } from "../citations";
import { getVideo, listScenes, videoFile } from "../video/store";
import { parseVtt } from "../video/captions";
import {
  NotesError,
  type NotesDraft,
  type NotesState,
  type PublishedLesson,
  type Sharing,
} from "./types";
import { canReadShare, shareSettings, validateNotes } from "./validation";

// Additive tables; also initialized when Next hot-reloads with an existing DB connection.
db.exec(`
  CREATE TABLE IF NOT EXISTS lesson_notes (
    lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
    document TEXT NOT NULL, revision INTEGER NOT NULL, basis TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lesson_shares (
    lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE, mode TEXT NOT NULL DEFAULT 'private' CHECK(mode IN ('private','restricted','anyone')),
    emails TEXT NOT NULL DEFAULT '[]', snapshot TEXT, published_at TEXT
  );
`);
type NotesRow = {
  document: string;
  revision: number;
  basis: string;
  updated_at: string;
};
type ShareRow = {
  lesson_id: string;
  token: string;
  mode: Sharing["mode"];
  emails: string;
  snapshot: string | null;
  published_at: string | null;
};
const emptySharing = (): Sharing => ({
  mode: "private",
  emails: [],
  token: null,
  publishedAt: null,
  revision: null,
});

export function notesContext(email: string, lessonId: string) {
  const lesson = getLesson(email, lessonId);
  if (!lesson) throw new NotesError("Lesson not found.", 404);
  const video = getVideo(lessonId);
  const scenes = video ? listScenes(video.id) : [];
  const sources = listSources(lessonId);
  const basis = createHash("sha256")
    .update(
      JSON.stringify({
        topic: lesson.topic,
        level: lesson.level,
        objectives: lesson.objectives,
        videoId: video?.id,
        version: video?.scriptVersion,
        scenes,
      }),
    )
    .digest("hex");
  const file = videoFile(lessonId)?.file;
  const ready =
    !!video &&
    video.status === "ready" &&
    video.renderedVersion === video.scriptVersion &&
    !!file &&
    fs.existsSync(file);
  const timestamps: Record<string, number> = {};
  if (ready && file) {
    try {
      const chapters = parseVtt(
        fs.readFileSync(file.replace(/\.mp4$/, ".chapters.vtt"), "utf8"),
      );
      let index = -1;
      let previous: string | null = null;
      for (const scene of scenes) {
        if (scene.chapter !== previous) {
          index++;
          previous = scene.chapter;
        }
        const chapter = chapters[index];
        if (chapter && chapter.text === scene.chapter)
          timestamps[scene.id] = chapter.start;
      }
    } catch {
      /* No fabricated timestamps when the rendered chapter track is absent. */
    }
  }
  return { lesson, video, scenes, sources, basis, ready, file, timestamps };
}
export function getDraft(lessonId: string): NotesDraft | null {
  const row = db
    .prepare("SELECT * FROM lesson_notes WHERE lesson_id = ?")
    .get(lessonId) as NotesRow | undefined;
  return row
    ? {
        document: JSON.parse(row.document),
        revision: row.revision,
        basis: row.basis,
        updatedAt: row.updated_at,
      }
    : null;
}
function shareRow(lessonId: string) {
  return db
    .prepare("SELECT * FROM lesson_shares WHERE lesson_id = ?")
    .get(lessonId) as ShareRow | undefined;
}
export function notesState(email: string, lessonId: string): NotesState {
  const ctx = notesContext(email, lessonId);
  const draft = getDraft(lessonId);
  const row = shareRow(lessonId);
  const stale = !!draft && draft.basis !== ctx.basis;
  return {
    draft,
    stale,
    hasScript: !!ctx.scenes.length,
    canPublish: !!draft && !stale && ctx.ready,
    scenes: ctx.scenes.map(({ id, title, chapter }) => ({
      id,
      title,
      chapter,
    })),
    timestamps: ctx.timestamps,
    citations: ctx.sources.map((s) => ({
      id: s.id,
      text: apaCitation(s),
      url: s.doi || s.url,
    })),
    videoVersion: ctx.ready ? ctx.video!.renderedVersion : null,
    sharing: row
      ? {
          mode: row.mode,
          emails: JSON.parse(row.emails),
          token: row.token,
          publishedAt: row.published_at,
          revision: row.snapshot
            ? (JSON.parse(row.snapshot) as PublishedLesson).revision
            : null,
        }
      : emptySharing(),
  };
}
export function saveDraft(
  email: string,
  lessonId: string,
  document: unknown,
  expectedRevision: number,
  basis: string,
) {
  return db.transaction(() => {
    const ctx = notesContext(email, lessonId);
    const current = getDraft(lessonId);
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new NotesError(
        "These notes changed in another tab. Reload before saving.",
        409,
      );
    if (basis !== ctx.basis)
      throw new NotesError(
        "The video script changed. Generate notes from the current script.",
        409,
      );
    const checked = validateNotes(
      document,
      new Set(ctx.scenes.map((s) => s.id)),
      new Set(ctx.sources.map((s) => s.id)),
    );
    db.prepare(
      `INSERT INTO lesson_notes (lesson_id, document, revision, basis, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lesson_id) DO UPDATE SET document=excluded.document, revision=excluded.revision, basis=excluded.basis, updated_at=excluded.updated_at`,
    ).run(
      lessonId,
      JSON.stringify(checked),
      expectedRevision + 1,
      basis,
      new Date().toISOString(),
    );
    return notesState(email, lessonId);
  })();
}
export function changeSharing(
  email: string,
  lessonId: string,
  mode: unknown,
  emails: unknown,
) {
  notesContext(email, lessonId);
  const checked = shareSettings(mode, emails);
  const row = shareRow(lessonId);
  if (checked.mode !== "private" && !row?.snapshot)
    throw new NotesError(
      "Review and publish the lesson before enabling sharing.",
    );
  if (row)
    db.prepare(
      "UPDATE lesson_shares SET mode=?, emails=? WHERE lesson_id=?",
    ).run(checked.mode, JSON.stringify(checked.emails), lessonId);
  return notesState(email, lessonId);
}
export function publishNotes(
  email: string,
  lessonId: string,
  revision: number,
  mode: unknown,
  emails: unknown,
) {
  const ctx = notesContext(email, lessonId);
  const draft = getDraft(lessonId);
  const checked = shareSettings(mode, emails);
  if (checked.mode === "private")
    throw new NotesError("Choose who can view the published lesson.");
  if (!draft || draft.revision !== revision)
    throw new NotesError(
      "Save your notes and review the latest version before publishing.",
      409,
    );
  if (draft.basis !== ctx.basis || !ctx.ready || !ctx.file)
    throw new NotesError(
      "Render the current video and generate matching notes before publishing.",
      409,
    );
  validateNotes(
    draft.document,
    new Set(ctx.scenes.map((s) => s.id)),
    new Set(ctx.sources.map((s) => s.id)),
  );
  const token = shareRow(lessonId)?.token || randomBytes(32).toString("hex");
  // Independent media snapshot: rendering a new script deletes old video outputs.
  const dir = path.join(
    /* turbopackIgnore: true */ process.env.SHARED_LESSON_DIR ||
      path.join(process.cwd(), "data", "shared"),
    token,
  );
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${randomUUID()}.mp4`);
  try {
    fs.copyFileSync(ctx.file, file);
    for (const suffix of ["captions.vtt", "chapters.vtt"]) {
      const from = ctx.file.replace(/\.mp4$/, `.${suffix}`);
      if (fs.existsSync(from))
        fs.copyFileSync(from, file.replace(/\.mp4$/, `.${suffix}`));
    }
    const publishedAt = new Date().toISOString();
    const used = new Set(draft.document.sections.flatMap((s) => s.sourceIds));
    const snapshot: PublishedLesson = {
      topic: ctx.lesson.topic,
      level: ctx.lesson.level,
      objectives: ctx.lesson.objectives,
      document: draft.document,
      timestamps: ctx.timestamps,
      citations: ctx.sources
        .filter((s) => used.has(s.id))
        .map((s) => ({ id: s.id, text: apaCitation(s), url: s.doi || s.url })),
      revision,
      video: {
        file,
        title: ctx.video!.title || ctx.lesson.topic,
        version: ctx.video!.renderedVersion!,
      },
      publishedAt,
    };
    db.prepare(
      `INSERT INTO lesson_shares (lesson_id, token, mode, emails, snapshot, published_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(lesson_id) DO UPDATE SET mode=excluded.mode, emails=excluded.emails, snapshot=excluded.snapshot, published_at=excluded.published_at`,
    ).run(
      lessonId,
      token,
      checked.mode,
      JSON.stringify(checked.emails),
      JSON.stringify(snapshot),
      publishedAt,
    );
    return notesState(email, lessonId);
  } catch (error) {
    for (const suffix of ["", ".captions.vtt", ".chapters.vtt"])
      fs.rmSync(suffix ? file.replace(/\.mp4$/, suffix) : file, {
        force: true,
      });
    throw error;
  }
}
export function sharedLesson(
  token: string,
  viewer: { email: string; emailVerified: boolean } | null,
):
  | { status: "allowed"; snapshot: PublishedLesson }
  | { status: "missing" | "signin" | "denied" } {
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: "missing" };
  const row = db
    .prepare(
      `SELECT s.*, l.teacher_email FROM lesson_shares s JOIN lessons l ON l.id=s.lesson_id WHERE s.token=?`,
    )
    .get(token) as (ShareRow & { teacher_email: string }) | undefined;
  if (!row || row.mode === "private" || !row.snapshot)
    return { status: "missing" };
  if (
    !canReadShare(row.mode, JSON.parse(row.emails), row.teacher_email, viewer)
  )
    return { status: viewer ? "denied" : "signin" };
  return { status: "allowed", snapshot: JSON.parse(row.snapshot) };
}

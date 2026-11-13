import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";

export type Level = "high_school" | "college";

export const LEVEL_LABEL: Record<Level, string> = {
  high_school: "High school",
  college: "College",
};

export type Lesson = {
  id: string;
  teacherEmail: string;
  topic: string;
  level: Level;
  durationMinutes: number;
  priorKnowledge: string;
  objectives: string[];
  createdAt: string;
  updatedAt: string;
};

/** "scrapy": found by a source search. "link": pasted by the teacher. ("discover"/"serp": older Bright Data rows.) */
export type FoundVia = "scrapy" | "link" | "discover" | "serp";

export type SavedSource = {
  id: string;
  lessonId: string;
  url: string;
  title: string;
  description: string | null;
  site: string;
  relevance: number | null;
  foundVia: FoundVia;
  savedAt: string;
  kind: string | null;
  authors: string[];
  published: string | null;
  doi: string | null;
};

type LessonRow = {
  id: string;
  teacher_email: string;
  topic: string;
  level: Level;
  duration_minutes: number;
  prior_knowledge: string;
  objectives: string;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  id: string;
  lesson_id: string;
  url: string;
  title: string;
  description: string | null;
  site: string;
  relevance: number | null;
  found_via: FoundVia;
  saved_at: string;
  kind: string | null;
  authors: string | null;
  published: string | null;
  doi: string | null;
};

const toLesson = (r: LessonRow): Lesson => ({
  id: r.id,
  teacherEmail: r.teacher_email,
  topic: r.topic,
  level: r.level,
  durationMinutes: r.duration_minutes,
  priorKnowledge: r.prior_knowledge,
  objectives: JSON.parse(r.objectives) as string[],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toSource = (r: SourceRow): SavedSource => ({
  id: r.id,
  lessonId: r.lesson_id,
  url: r.url,
  title: r.title,
  description: r.description,
  site: r.site,
  relevance: r.relevance,
  foundVia: r.found_via,
  savedAt: r.saved_at,
  kind: r.kind,
  authors: parseAuthors(r.authors),
  published: r.published,
  doi: r.doi,
});

function parseAuthors(value: string | null): string[] {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export type NewLesson = Omit<Lesson, "id" | "teacherEmail" | "createdAt" | "updatedAt">;

export function createLesson(teacherEmail: string, input: NewLesson): Lesson {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO lessons (id, teacher_email, topic, level, duration_minutes, prior_knowledge, objectives, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    teacherEmail,
    input.topic,
    input.level,
    input.durationMinutes,
    input.priorKnowledge,
    JSON.stringify(input.objectives),
    now,
    now,
  );
  return { id, teacherEmail, ...input, createdAt: now, updatedAt: now };
}

/** Only returns the lesson if it belongs to this teacher. */
export function getLesson(teacherEmail: string, id: string): Lesson | null {
  const row = db
    .prepare(`SELECT * FROM lessons WHERE id = ? AND teacher_email = ?`)
    .get(id, teacherEmail) as LessonRow | undefined;
  return row ? toLesson(row) : null;
}

export type LessonListItem = Lesson & { sourceCount: number };

export function listLessons(teacherEmail: string): LessonListItem[] {
  const rows = db
    .prepare(
      `SELECT l.*, (SELECT COUNT(*) FROM lesson_sources s WHERE s.lesson_id = l.id) AS source_count
       FROM lessons l WHERE l.teacher_email = ? ORDER BY l.created_at DESC`,
    )
    .all(teacherEmail) as (LessonRow & { source_count: number })[];
  return rows.map((r) => ({ ...toLesson(r), sourceCount: r.source_count }));
}

export function deleteLesson(teacherEmail: string, id: string) {
  db.prepare(`DELETE FROM lessons WHERE id = ? AND teacher_email = ?`).run(id, teacherEmail);
}

export function listSources(lessonId: string): SavedSource[] {
  const rows = db
    .prepare(`SELECT * FROM lesson_sources WHERE lesson_id = ? ORDER BY saved_at ASC`)
    .all(lessonId) as SourceRow[];
  return rows.map(toSource);
}

export type SourceInput = {
  url: string;
  title: string;
  description: string | null;
  relevance: number | null;
  foundVia: "scrapy" | "link";
  /** Publisher name. Defaults to the link's hostname. */
  site?: string | null;
  kind?: string | null;
  authors?: string[];
  published?: string | null;
  doi?: string | null;
};

/** Saving the same link twice keeps the first save. */
export function saveSource(lessonId: string, input: SourceInput) {
  const site = input.site?.trim() || new URL(input.url).hostname.replace(/^www\./, "");
  db.prepare(
    `INSERT INTO lesson_sources
       (id, lesson_id, url, title, description, site, relevance, found_via, saved_at, kind, authors, published, doi)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (lesson_id, url) DO NOTHING`,
  ).run(
    randomUUID(),
    lessonId,
    input.url,
    input.title,
    input.description,
    site,
    input.relevance,
    input.foundVia,
    new Date().toISOString(),
    input.kind ?? null,
    input.authors?.length ? JSON.stringify(input.authors) : null,
    input.published ?? null,
    input.doi ?? null,
  );
  db.prepare(`UPDATE lessons SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), lessonId);
}

export function removeSource(lessonId: string, sourceId: string) {
  db.prepare(`DELETE FROM lesson_sources WHERE id = ? AND lesson_id = ?`).run(sourceId, lessonId);
}

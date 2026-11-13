import "server-only";
import { createHash, randomUUID } from "node:crypto";
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
  /** Lesson length in seconds, from 10 seconds to 30 minutes. */
  durationSeconds: number;
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
  duration_seconds: number | null;
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
  durationSeconds: r.duration_seconds ?? r.duration_minutes * 60,
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
    `INSERT INTO lessons (id, teacher_email, topic, level, duration_minutes, duration_seconds, prior_knowledge, objectives, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    teacherEmail,
    input.topic,
    input.level,
    Math.max(1, Math.round(input.durationSeconds / 60)), // older column, kept filled in
    input.durationSeconds,
    input.priorKnowledge,
    JSON.stringify(input.objectives),
    now,
    now,
  );
  return { id, teacherEmail, ...input, createdAt: now, updatedAt: now };
}

/** Changes when anything the story is written from changes: topic, level, length, prior knowledge or objectives. */
export function lessonDetailsKey(lesson: NewLesson): string {
  const { topic, level, durationSeconds, priorKnowledge, objectives } = lesson;
  return createHash("sha256")
    .update(JSON.stringify([topic, level, durationSeconds, priorKnowledge, objectives]))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Where each old objective went after an edit, by position in the old list.
 * An objective whose text is unchanged follows its text, even if it moved.
 * A reworded one keeps its place. A deleted one (its place now holds another
 * objective, or is past the end of the list) goes to the objective before it.
 */
export function objectiveMap(before: string[], after: string[]): number[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const taken = new Set<number>();
  const byText = before.map((o) => {
    const j = after.findIndex((a, k) => !taken.has(k) && norm(a) === norm(o));
    if (j >= 0) taken.add(j);
    return j;
  });
  const map: number[] = [];
  byText.forEach((j, i) => {
    if (j >= 0) map.push(j);
    else if (i < after.length && !taken.has(i)) map.push(i);
    else map.push(i > 0 ? map[i - 1] : 0);
  });
  return map;
}

/**
 * Saves the teacher's edits. Story video scenes keep pointing at the same
 * objectives. Returns false if the lesson isn't this teacher's.
 */
export const updateLesson = db.transaction((teacherEmail: string, id: string, input: NewLesson): boolean => {
  const current = getLesson(teacherEmail, id);
  if (!current) return false;
  // A story written before ClassForward tracked this was written for the details as they were.
  db.prepare(`UPDATE lesson_videos SET story_for = ? WHERE lesson_id = ? AND story_for IS NULL AND title IS NOT NULL`).run(
    lessonDetailsKey(current),
    id,
  );
  db.prepare(
    `UPDATE lessons SET topic = ?, level = ?, duration_minutes = ?, duration_seconds = ?, prior_knowledge = ?, objectives = ?, updated_at = ?
     WHERE id = ? AND teacher_email = ?`,
  ).run(
    input.topic,
    input.level,
    Math.max(1, Math.round(input.durationSeconds / 60)),
    input.durationSeconds,
    input.priorKnowledge,
    JSON.stringify(input.objectives),
    new Date().toISOString(),
    id,
    teacherEmail,
  );
  const map = objectiveMap(current.objectives, input.objectives);
  const scenes = db
    .prepare(
      `SELECT s.id, s.objective FROM video_scenes s JOIN lesson_videos v ON v.id = s.video_id WHERE v.lesson_id = ?`,
    )
    .all(id) as { id: string; objective: number }[];
  const move = db.prepare(`UPDATE video_scenes SET objective = ? WHERE id = ?`);
  for (const s of scenes) {
    const to = map[s.objective] ?? input.objectives.length - 1;
    if (to !== s.objective) move.run(to, s.id);
  }
  return true;
});

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

import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * One SQLite file for ClassForward: data/classforward.db (gitignored).
 * Set DATABASE_PATH to put it somewhere else.
 *
 * Fine for local use and demos. For a hosted deploy (Vercel and friends
 * have no writable disk), swap this for Postgres or Turso.
 */
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "classforward.db");

const globalForDb = globalThis as unknown as { classforwardDb?: Database.Database };

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Creates missing tables and columns. Safe to run again: it never changes or removes data. */
function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id               TEXT PRIMARY KEY,
      teacher_email    TEXT NOT NULL,
      topic            TEXT NOT NULL,
      level            TEXT NOT NULL CHECK (level IN ('high_school', 'college')),
      duration_minutes INTEGER NOT NULL,
      prior_knowledge  TEXT NOT NULL,
      objectives       TEXT NOT NULL, -- JSON array of strings
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lessons_by_teacher ON lessons (teacher_email, created_at DESC);

    CREATE TABLE IF NOT EXISTS lesson_sources (
      id          TEXT PRIMARY KEY,
      lesson_id   TEXT NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      site        TEXT NOT NULL,
      relevance   REAL,           -- search ranking score, when available
      found_via   TEXT NOT NULL,  -- 'scrapy' (search), 'link' (pasted by the teacher); older rows: 'discover' or 'serp'
      saved_at    TEXT NOT NULL,
      UNIQUE (lesson_id, url)
    );
  `);
  db.exec(`
    -- The story video for a lesson: one per lesson, so writing the story again replaces it.
    CREATE TABLE IF NOT EXISTS lesson_videos (
      id               TEXT PRIMARY KEY,
      lesson_id        TEXT NOT NULL UNIQUE REFERENCES lessons (id) ON DELETE CASCADE,
      status           TEXT NOT NULL,  -- 'writing', 'draft', 'rendering', 'ready', 'failed'
      title            TEXT,
      logline          TEXT,
      problem          TEXT,
      explanation      TEXT,
      characters       TEXT,           -- JSON array of { name, role, look }
      error            TEXT,           -- what went wrong, in words a teacher can act on
      failed_step      TEXT,           -- 'writing' or 'rendering'
      progress         TEXT,           -- JSON { step, done, total } while rendering
      script_version   INTEGER NOT NULL DEFAULT 1,
      rendered_version INTEGER,        -- script_version the current video file was made from
      video_file       TEXT,           -- path under data/videos
      duration_seconds REAL,
      rendered_at      TEXT,
      model            TEXT,
      voice_id         TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    -- One scene of the storyboard: a drawing on screen while the narration plays.
    CREATE TABLE IF NOT EXISTS video_scenes (
      id           TEXT PRIMARY KEY,
      video_id     TEXT NOT NULL REFERENCES lesson_videos (id) ON DELETE CASCADE,
      position     INTEGER NOT NULL,
      chapter      TEXT NOT NULL,
      title        TEXT NOT NULL,
      narration    TEXT NOT NULL,
      visual       TEXT NOT NULL,      -- what the drawing shows
      objective    INTEGER NOT NULL,   -- index into the lesson's learning objectives
      svg          TEXT,               -- the drawing, once made
      svg_for      TEXT,               -- hash of what it was drawn from; redrawn when that changes
      audio_file   TEXT,
      audio_for    TEXT,               -- hash of the narration and voice it was recorded from
      audio_seconds REAL,
      words        TEXT,               -- JSON [{ text, start, end }] word timings, for captions
      UNIQUE (video_id, position)
    );
    CREATE INDEX IF NOT EXISTS scenes_by_video ON video_scenes (video_id, position);
  `);
  addMissingColumns(db, "lessons", {
    duration_seconds: "INTEGER", // lesson length; older rows only have duration_minutes
  });
  addMissingColumns(db, "lesson_videos", {
    story_for: "TEXT", // lessonDetailsKey() of the lesson when the story was written
  });
  addMissingColumns(db, "lesson_sources", {
    kind: "TEXT", //        "Encyclopedia article", "Research article", "Web page"...
    authors: "TEXT", //     JSON array of names
    published: "TEXT", //   "2026-11-03", "2026-11" or "2026"
    doi: "TEXT",
  });
}

/** Additive migrations only: new nullable columns, never dropping or rewriting data. */
function addMissingColumns(db: Database.Database, table: string, columns: Record<string, string>) {
  const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

// Reuse one connection across hot reloads in dev. Migrations run on every
// reload too, so a new column is there without restarting the dev server.
export const db = globalForDb.classforwardDb ?? open();
migrate(db);
if (process.env.NODE_ENV !== "production") globalForDb.classforwardDb = db;

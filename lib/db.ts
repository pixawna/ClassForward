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
  addMissingColumns(db, "lesson_sources", {
    kind: "TEXT", //        "Encyclopedia article", "Research article", "Web page"...
    authors: "TEXT", //     JSON array of names
    published: "TEXT", //   "2026-11-03", "2026-11" or "2026"
    doi: "TEXT",
  });
  return db;
}

/** Additive migrations only: new nullable columns, never dropping or rewriting data. */
function addMissingColumns(db: Database.Database, table: string, columns: Record<string, string>) {
  const existing = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

// Reuse one connection across hot reloads in dev.
export const db = globalForDb.classforwardDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.classforwardDb = db;

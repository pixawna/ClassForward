import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import type { Character, RenderProgress, Scene, ScriptEdit, Video, VideoStatus } from "./types";

/*
 * Story videos in SQLite. Callers check that the lesson belongs to the
 * signed-in teacher (getLesson) before touching its video.
 */

type VideoRow = {
  id: string;
  lesson_id: string;
  status: VideoStatus;
  title: string | null;
  logline: string | null;
  problem: string | null;
  explanation: string | null;
  characters: string | null;
  error: string | null;
  failed_step: "writing" | "rendering" | null;
  progress: string | null;
  script_version: number;
  rendered_version: number | null;
  video_file: string | null;
  duration_seconds: number | null;
  rendered_at: string | null;
  story_for: string | null;
  updated_at: string;
};

export type SceneRow = {
  id: string;
  video_id: string;
  position: number;
  chapter: string;
  title: string;
  narration: string;
  visual: string;
  objective: number;
  svg: string | null;
  svg_for: string | null;
  audio_file: string | null;
  audio_for: string | null;
  audio_seconds: number | null;
  words: string | null;
};

const now = () => new Date().toISOString();

function parse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const toVideo = (r: VideoRow): Video => ({
  id: r.id,
  lessonId: r.lesson_id,
  status: r.status,
  title: r.title,
  logline: r.logline,
  problem: r.problem,
  explanation: r.explanation,
  characters: parse<Character[]>(r.characters, []),
  error: r.error,
  failedStep: r.failed_step,
  progress: parse<RenderProgress | null>(r.progress, null),
  scriptVersion: r.script_version,
  renderedVersion: r.rendered_version,
  durationSeconds: r.duration_seconds,
  renderedAt: r.rendered_at,
  storyFor: r.story_for,
  updatedAt: r.updated_at,
});

const toScene = (r: SceneRow): Scene => ({
  id: r.id,
  position: r.position,
  chapter: r.chapter,
  title: r.title,
  narration: r.narration,
  visual: r.visual,
  objective: r.objective,
  drawn: !!r.svg,
});

export function getVideo(lessonId: string): Video | null {
  const row = db.prepare(`SELECT * FROM lesson_videos WHERE lesson_id = ?`).get(lessonId) as VideoRow | undefined;
  return row ? toVideo(row) : null;
}

export function videoFile(lessonId: string): { file: string; title: string | null } | null {
  const row = db
    .prepare(`SELECT video_file, title FROM lesson_videos WHERE lesson_id = ? AND video_file IS NOT NULL`)
    .get(lessonId) as { video_file: string; title: string | null } | undefined;
  return row ? { file: row.video_file, title: row.title } : null;
}

export function listScenes(videoId: string): Scene[] {
  const rows = db.prepare(`SELECT * FROM video_scenes WHERE video_id = ? ORDER BY position`).all(videoId) as SceneRow[];
  return rows.map(toScene);
}

/** Scenes with their drawings and recordings, for rendering. */
export function sceneRows(videoId: string): SceneRow[] {
  return db.prepare(`SELECT * FROM video_scenes WHERE video_id = ? ORDER BY position`).all(videoId) as SceneRow[];
}

/** Starts (or restarts) writing the story. Existing scenes stay until the new story replaces them. */
export function markWriting(lessonId: string): Video {
  const existing = getVideo(lessonId);
  if (existing) {
    db.prepare(
      `UPDATE lesson_videos SET status = 'writing', error = NULL, failed_step = NULL, progress = NULL, updated_at = ? WHERE id = ?`,
    ).run(now(), existing.id);
  } else {
    db.prepare(
      `INSERT INTO lesson_videos (id, lesson_id, status, created_at, updated_at) VALUES (?, ?, 'writing', ?, ?)`,
    ).run(randomUUID(), lessonId, now(), now());
  }
  return getVideo(lessonId)!;
}

export type StoryScene = { chapter: string; title: string; narration: string; visual: string; objective: number };

export type Story = {
  title: string;
  logline: string;
  problem: string;
  explanation: string;
  characters: Character[];
  scenes: StoryScene[];
};

/** A new story replaces the old scenes in one transaction, so a retry never duplicates scenes. */
export const saveStory = db.transaction((videoId: string, story: Story, model: string, storyFor: string | null = null) => {
  db.prepare(`DELETE FROM video_scenes WHERE video_id = ?`).run(videoId);
  const insert = db.prepare(
    `INSERT INTO video_scenes (id, video_id, position, chapter, title, narration, visual, objective)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  story.scenes.forEach((s, i) => insert.run(randomUUID(), videoId, i, s.chapter, s.title, s.narration, s.visual, s.objective));
  db.prepare(
    `UPDATE lesson_videos SET status = 'draft', title = ?, logline = ?, problem = ?, explanation = ?, characters = ?,
       error = NULL, failed_step = NULL, progress = NULL, script_version = script_version + 1, model = ?, story_for = ?, updated_at = ?
     WHERE id = ?`,
  ).run(story.title, story.logline, story.problem, story.explanation, JSON.stringify(story.characters), model, storyFor, now(), videoId);
});

/**
 * The teacher's edits. Scenes keep their drawings and recordings; anything
 * whose text changed is redrawn or re-recorded at the next render.
 */
export const saveScript = db.transaction((videoId: string, script: ScriptEdit) => {
  const existing = new Set(
    (db.prepare(`SELECT id FROM video_scenes WHERE video_id = ?`).all(videoId) as { id: string }[]).map((r) => r.id),
  );
  const keep = new Set(script.scenes.map((s) => s.id).filter((id): id is string => !!id && existing.has(id)));
  for (const id of existing) {
    if (!keep.has(id)) db.prepare(`DELETE FROM video_scenes WHERE id = ?`).run(id);
  }
  // Move everything out of the way first: positions are unique per video.
  db.prepare(`UPDATE video_scenes SET position = -1 - position WHERE video_id = ?`).run(videoId);
  const update = db.prepare(
    `UPDATE video_scenes SET position = ?, chapter = ?, title = ?, narration = ?, visual = ?, objective = ? WHERE id = ? AND video_id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO video_scenes (id, video_id, position, chapter, title, narration, visual, objective) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  script.scenes.forEach((s, i) => {
    if (s.id && keep.has(s.id)) update.run(i, s.chapter, s.title, s.narration, s.visual, s.objective, s.id, videoId);
    else insert.run(randomUUID(), videoId, i, s.chapter, s.title, s.narration, s.visual, s.objective);
  });
  db.prepare(
    `UPDATE lesson_videos SET title = ?, script_version = script_version + 1,
       status = CASE WHEN status = 'failed' THEN 'draft' ELSE status END, error = NULL, failed_step = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(script.title, now(), videoId);
});

export function markFailed(videoId: string, step: "writing" | "rendering", message: string) {
  db.prepare(
    `UPDATE lesson_videos SET status = 'failed', failed_step = ?, error = ?, progress = NULL, updated_at = ? WHERE id = ?`,
  ).run(step, message, now(), videoId);
}

export function markRendering(videoId: string) {
  db.prepare(
    `UPDATE lesson_videos SET status = 'rendering', error = NULL, failed_step = NULL, progress = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify({ step: "Getting ready", done: 0, total: 1 }), now(), videoId);
}

export function setProgress(videoId: string, progress: RenderProgress) {
  db.prepare(`UPDATE lesson_videos SET progress = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(progress), now(), videoId);
}

export function finishRender(videoId: string, file: string, durationSeconds: number, scriptVersion: number) {
  db.prepare(
    `UPDATE lesson_videos SET status = 'ready', video_file = ?, duration_seconds = ?, rendered_version = ?, rendered_at = ?,
       progress = NULL, error = NULL, failed_step = NULL, updated_at = ? WHERE id = ?`,
  ).run(file, durationSeconds, scriptVersion, now(), now(), videoId);
}

export function saveDrawing(sceneId: string, svg: string, drawnFor: string) {
  db.prepare(`UPDATE video_scenes SET svg = ?, svg_for = ? WHERE id = ?`).run(svg, drawnFor, sceneId);
}

export function saveRecording(
  sceneId: string,
  recording: { file: string; recordedFor: string; seconds: number; words: { text: string; start: number; end: number }[] },
) {
  db.prepare(`UPDATE video_scenes SET audio_file = ?, audio_for = ?, audio_seconds = ?, words = ? WHERE id = ?`).run(
    recording.file,
    recording.recordedFor,
    recording.seconds,
    JSON.stringify(recording.words),
    sceneId,
  );
}

export function sceneDrawing(videoId: string, sceneId: string): string | null {
  const row = db.prepare(`SELECT svg FROM video_scenes WHERE id = ? AND video_id = ?`).get(sceneId, videoId) as
    | { svg: string | null }
    | undefined;
  return row?.svg ?? null;
}

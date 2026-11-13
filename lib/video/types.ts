// Shared by server and browser code: no server imports here.

export type VideoStatus = "writing" | "draft" | "rendering" | "ready" | "failed";

export type Character = { name: string; role: string; look: string };

export type RenderProgress = { step: string; done: number; total: number };

export type Video = {
  id: string;
  lessonId: string;
  status: VideoStatus;
  title: string | null;
  logline: string | null;
  problem: string | null;
  explanation: string | null;
  characters: Character[];
  error: string | null;
  failedStep: "writing" | "rendering" | null;
  progress: RenderProgress | null;
  scriptVersion: number;
  renderedVersion: number | null;
  durationSeconds: number | null;
  renderedAt: string | null;
  /** Which version of the lesson's details the story was written for (see lessonDetailsKey). */
  storyFor: string | null;
  updatedAt: string;
};

export type Scene = {
  id: string;
  position: number;
  chapter: string;
  title: string;
  narration: string;
  visual: string;
  /** Index into the lesson's learning objectives. */
  objective: number;
  /** True once the scene has a drawing (after a render). */
  drawn?: boolean;
};

/** A scene as the teacher edits it. No id means a new scene. */
export type SceneEdit = Omit<Scene, "id" | "position" | "drawn"> & { id?: string };

export type ScriptEdit = { title: string; scenes: SceneEdit[] };

/** Spoken English runs at about 140 words a minute in a calm lesson. */
export const WORDS_PER_MINUTE = 140;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function estimatedSeconds(narration: string): number {
  return Math.round((wordCount(narration) / WORDS_PER_MINUTE) * 60);
}

/** Group scenes into named chapters, keeping their order. */
export function chaptersOf<T extends { chapter: string }>(scenes: T[]): { title: string; scenes: T[] }[] {
  const chapters: { title: string; scenes: T[] }[] = [];
  for (const scene of scenes) {
    const last = chapters[chapters.length - 1];
    if (last && last.title === scene.chapter) last.scenes.push(scene);
    else chapters.push({ title: scene.chapter, scenes: [scene] });
  }
  return chapters;
}

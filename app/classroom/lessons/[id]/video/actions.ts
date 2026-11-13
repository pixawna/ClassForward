"use server";

import { revalidatePath } from "next/cache";
import { getLesson } from "@/lib/lessons";
import { requireTeacher } from "@/lib/session";
import { VideoSetupError } from "@/lib/video/config";
import { isRunning, startRender, startWriting } from "@/lib/video/jobs";
import { videoState, type VideoState } from "@/lib/video/state";
import { getVideo, saveScript } from "@/lib/video/store";
import type { ScriptEdit } from "@/lib/video/types";

export type VideoActionResult = { ok: boolean; message?: string; state: VideoState };

async function ownLesson(lessonId: string) {
  const teacher = await requireTeacher();
  const lesson = getLesson(teacher.email, lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  return lesson;
}

function refresh(lessonId: string) {
  revalidatePath(`/classroom/lessons/${lessonId}`);
  revalidatePath(`/classroom/lessons/${lessonId}/video`);
}

export async function writeStoryAction(lessonId: string): Promise<VideoActionResult> {
  const lesson = await ownLesson(lessonId);
  try {
    startWriting(lesson);
  } catch (err) {
    if (err instanceof VideoSetupError) return { ok: false, message: err.message, state: videoState(lesson) };
    throw err;
  }
  refresh(lesson.id);
  return { ok: true, state: videoState(lesson) };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function saveScriptAction(lessonId: string, script: ScriptEdit): Promise<VideoActionResult> {
  const lesson = await ownLesson(lessonId);
  const video = getVideo(lesson.id);
  if (!video) return { ok: false, message: "Write the story first.", state: videoState(lesson) };
  if (isRunning(lesson.id) || video.status === "writing" || video.status === "rendering") {
    return { ok: false, message: "Wait until the current step finishes, then save your changes.", state: videoState(lesson) };
  }

  const title = text(script?.title, 120);
  const scenes = Array.isArray(script?.scenes) ? script.scenes.slice(0, 80) : [];
  const problems: string[] = [];
  if (!title) problems.push("Give the video a title.");
  if (scenes.length === 0) problems.push("Keep at least one scene.");
  const clean = scenes.map((s, i) => {
    const scene = {
      id: typeof s?.id === "string" ? s.id : undefined,
      chapter: text(s?.chapter, 80),
      title: text(s?.title, 120),
      narration: text(s?.narration, 2000),
      visual: text(s?.visual, 1000),
      objective: Number(s?.objective),
    };
    if (!scene.chapter) problems.push(`Scene ${i + 1} needs a chapter name.`);
    if (!scene.title) problems.push(`Scene ${i + 1} needs a title.`);
    if (!scene.narration) problems.push(`Scene ${i + 1} needs narration.`);
    if (!scene.visual) problems.push(`Scene ${i + 1} needs a description of what's on screen.`);
    if (!Number.isInteger(scene.objective) || scene.objective < 0 || scene.objective >= lesson.objectives.length) {
      problems.push(`Scene ${i + 1} needs one of the lesson's objectives.`);
    }
    return scene;
  });
  if (problems.length) return { ok: false, message: problems.slice(0, 4).join(" "), state: videoState(lesson) };

  saveScript(video.id, { title, scenes: clean });
  refresh(lesson.id);
  return { ok: true, message: "Script saved.", state: videoState(lesson) };
}

export async function renderAction(lessonId: string): Promise<VideoActionResult> {
  const lesson = await ownLesson(lessonId);
  const video = getVideo(lesson.id);
  if (!video || video.status === "writing") {
    return { ok: false, message: "Write the story before rendering.", state: videoState(lesson) };
  }
  try {
    startRender(lesson);
  } catch (err) {
    if (err instanceof VideoSetupError) return { ok: false, message: err.message, state: videoState(lesson) };
    throw err;
  }
  refresh(lesson.id);
  return { ok: true, state: videoState(lesson) };
}

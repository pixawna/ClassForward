"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createLesson,
  getLesson,
  listSources,
  removeSource,
  saveSource,
  type Level,
  type SavedSource,
  type SourceInput,
} from "@/lib/lessons";
import { parsePublicUrl } from "@/lib/links";
import { readLink, ScrapyError } from "@/lib/scrapy";
import { DURATION_MAX, DURATION_MIN } from "@/lib/lesson-limits";
import { requireTeacher } from "@/lib/session";

export type LessonFormState = {
  errors: Partial<Record<"topic" | "level" | "duration" | "priorKnowledge" | "objectives", string>>;
  values?: {
    topic: string;
    level: string;
    duration: string;
    priorKnowledge: string;
    objectives: string[];
  };
};

const LEVELS: Level[] = ["high_school", "college"];

export async function createLessonAction(_prev: LessonFormState, formData: FormData): Promise<LessonFormState> {
  const teacher = await requireTeacher();

  const topic = String(formData.get("topic") ?? "").trim();
  const level = String(formData.get("level") ?? "");
  const duration = String(formData.get("duration") ?? "").trim();
  const priorKnowledge = String(formData.get("priorKnowledge") ?? "").trim();
  const objectives = formData
    .getAll("objective")
    .map((o) => String(o).trim())
    .filter(Boolean);

  const errors: LessonFormState["errors"] = {};
  if (topic.length < 2) errors.topic = "Enter the topic you're teaching.";
  else if (topic.length > 160) errors.topic = "Keep the topic under 160 characters.";
  if (!LEVELS.includes(level as Level)) errors.level = "Choose high school or college.";
  const minutes = Number(duration);
  if (!Number.isInteger(minutes) || minutes < DURATION_MIN || minutes > DURATION_MAX)
    errors.duration = `Choose a length from ${DURATION_MIN} to ${DURATION_MAX} minutes.`;
  if (priorKnowledge.length < 3) errors.priorKnowledge = "Describe what your students already know, even briefly.";
  if (objectives.length === 0) errors.objectives = "Add at least one learning objective.";
  else if (objectives.length > 8) errors.objectives = "Keep it to 8 objectives or fewer.";

  if (Object.keys(errors).length > 0) {
    return { errors, values: { topic, level, duration, priorKnowledge, objectives } };
  }

  const lesson = createLesson(teacher.email, {
    topic,
    level: level as Level,
    durationMinutes: minutes,
    priorKnowledge: priorKnowledge.slice(0, 2000),
    objectives: objectives.map((o) => o.slice(0, 300)),
  });

  revalidatePath("/classroom");
  redirect(`/classroom/lessons/${lesson.id}?new=1`);
}

async function ownLesson(lessonId: string) {
  const teacher = await requireTeacher();
  const lesson = getLesson(teacher.email, lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  return lesson;
}

export async function saveSourceAction(lessonId: string, source: SourceInput): Promise<SavedSource[]> {
  await ownLesson(lessonId);
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error("That source link isn't a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only web links can be saved.");

  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  saveSource(lessonId, {
    url: url.toString(),
    title: text(source.title, 300) ?? url.hostname,
    description: text(source.description, 600),
    relevance: typeof source.relevance === "number" && Number.isFinite(source.relevance) ? source.relevance : null,
    foundVia: source.foundVia === "link" ? "link" : "scrapy",
    site: text(source.site, 200),
    kind: text(source.kind, 80),
    authors: Array.isArray(source.authors) ? source.authors.map((a) => text(a, 120)).filter((a): a is string => !!a).slice(0, 20) : [],
    published: text(source.published, 10)?.match(/^\d{4}(-\d{2}(-\d{2})?)?$/) ? text(source.published, 10) : null,
    doi: text(source.doi, 200)?.startsWith("https://doi.org/") ? text(source.doi, 200) : null,
  });
  revalidatePath(`/classroom/lessons/${lessonId}`);
  revalidatePath("/classroom");
  return listSources(lessonId);
}

export async function removeSourceAction(lessonId: string, sourceId: string): Promise<SavedSource[]> {
  await ownLesson(lessonId);
  removeSource(lessonId, sourceId);
  revalidatePath(`/classroom/lessons/${lessonId}`);
  revalidatePath("/classroom");
  return listSources(lessonId);
}

export type AddLinkResult = { saved: SavedSource[]; message: string; ok: boolean };

/** A link the teacher pasted: Scrapy reads its citation details, then it's saved. */
export async function addLinkAction(lessonId: string, rawUrl: string): Promise<AddLinkResult> {
  await ownLesson(lessonId);
  const url = parsePublicUrl(rawUrl);
  if (!url) {
    return { ok: false, saved: listSources(lessonId), message: "Enter a full public web address, like https://example.org/article." };
  }

  let found = null;
  let note: string | null = null;
  try {
    ({ source: found, note } = await readLink(url.toString()));
  } catch (err) {
    note = err instanceof ScrapyError ? err.message : "the page couldn't be read";
    if (!(err instanceof ScrapyError)) console.error("[sources] reading link failed", err);
  }

  // Even if the page can't be read, keep the link so it can still be cited.
  const host = url.hostname.replace(/^www\./, "");
  saveSource(lessonId, {
    url: found?.url ?? url.toString(),
    title: (found?.title || `${host}${url.pathname === "/" ? "" : url.pathname}`).slice(0, 300),
    description: found?.description?.slice(0, 600) ?? null,
    relevance: null,
    foundVia: "link",
    site: found?.site ?? host,
    kind: found?.kind ?? "Web page",
    authors: found?.authors ?? [],
    published: found?.published ?? null,
    doi: found?.doi ?? null,
  });
  revalidatePath(`/classroom/lessons/${lessonId}`);
  revalidatePath("/classroom");

  const title = found?.title || host;
  return {
    ok: true,
    saved: listSources(lessonId),
    message: found?.verified
      ? `Saved "${title}".`
      : `Saved "${title}", but ${note ? note.replace(/\.$/, "") : "the page couldn't be read"}, so its details come from the link itself. Check its citation.`,
  };
}

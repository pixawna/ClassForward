import "server-only";
import fs from "node:fs";
import { Readable } from "node:stream";
import { getLesson } from "../lessons";
import { currentTeacher } from "../session";

/** The lesson, if the request comes from the teacher who owns it. */
export async function ownedLesson(request: Request, lessonId: string) {
  const teacher = await currentTeacher(request.headers);
  if (!teacher) return { error: Response.json({ error: "Sign in to see this video." }, { status: 401 }) };
  const lesson = getLesson(teacher.email, lessonId);
  if (!lesson) return { error: Response.json({ error: "Lesson not found." }, { status: 404 }) };
  return { lesson };
}

/** Serves a file with byte-range support, so the player can seek without downloading everything. */
export function fileResponse(request: Request, file: string, type: string, extraHeaders: Record<string, string> = {}) {
  const size = fs.statSync(file).size;
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, no-cache", ...extraHeaders };
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!range) {
    const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
  }
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] && range[2] ? Number(range[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  }
  const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: { ...base, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}

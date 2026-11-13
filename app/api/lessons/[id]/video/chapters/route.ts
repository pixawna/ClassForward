import fs from "node:fs";
import { ownedLesson } from "@/lib/video/http";
import { videoAssets } from "@/lib/video/render";
import { videoFile } from "@/lib/video/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { lesson, error } = await ownedLesson(request, (await params).id);
  if (error) return error;
  const found = videoFile(lesson.id);
  const file = found && videoAssets(found.file).chapters;
  if (!file || !fs.existsSync(file)) return new Response("WEBVTT\n", { status: 404, headers: { "Content-Type": "text/vtt" } });
  return new Response(fs.readFileSync(file, "utf8"), { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, no-cache" } });
}

import fs from "node:fs";
import { ownedLesson, fileResponse } from "@/lib/video/http";
import { videoFile } from "@/lib/video/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { lesson, error } = await ownedLesson(request, (await params).id);
  if (error) return error;
  const found = videoFile(lesson.id);
  if (!found || !fs.existsSync(found.file)) return Response.json({ error: "This video hasn't been rendered yet." }, { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  const name = `${(found.title || lesson.topic).replace(/[^\w\- ]+/g, "").trim() || "lesson"}.mp4`;
  return fileResponse(request, found.file, "video/mp4", download ? { "Content-Disposition": `attachment; filename="${name}"` } : {});
}

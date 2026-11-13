import { ownedLesson } from "@/lib/video/http";
import { getVideo, sceneDrawing } from "@/lib/video/store";

/** A scene's drawing, for the script editor. Shown in <img>, so nothing in it can run. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const { lesson, error } = await ownedLesson(request, id);
  if (error) return error;
  const video = getVideo(lesson.id);
  const svg = video && sceneDrawing(video.id, sceneId);
  if (!svg) return new Response("Not drawn yet", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}

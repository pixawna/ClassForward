import { ownedLesson } from "@/lib/video/http";
import { videoState } from "@/lib/video/state";

/** The story video's current state. The studio page polls this while Claude writes or the video renders. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { lesson, error } = await ownedLesson(request, (await params).id);
  if (error) return error;
  return Response.json(videoState(lesson), { headers: { "Cache-Control": "no-store" } });
}

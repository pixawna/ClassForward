import fs from "node:fs";
import { auth } from "@/lib/auth";
import { sharedLesson } from "@/lib/notes/store";
import { fileResponse } from "@/lib/video/http";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: r.headers });
  const result = sharedLesson(
    token,
    session
      ? { email: session.user.email, emailVerified: session.user.emailVerified }
      : null,
  );
  if (result.status !== "allowed")
    return new Response("Lesson unavailable", {
      status: result.status === "signin" ? 401 : 404,
    });
  const captions = new URL(r.url).searchParams.get("track") === "captions";
  const file = captions
    ? result.snapshot.video.file.replace(/\.mp4$/, ".captions.vtt")
    : result.snapshot.video.file;
  if (!fs.existsSync(file))
    return new Response("File not found", { status: 404 });
  return fileResponse(r, file, captions ? "text/vtt" : "video/mp4", {
    "Cache-Control": "private, no-store",
  });
}

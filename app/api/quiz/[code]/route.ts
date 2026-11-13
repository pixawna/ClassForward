import { currentTeacher } from "@/lib/session";
import { sameOrigin, failure, json, teacherEmail } from "@/lib/classroom-http";
import {
  roomState,
  joinRoom,
  submit,
  control,
  teamFor,
} from "@/lib/quiz/store";
export const dynamic = "force-dynamic";
function token(r: Request, code: string) {
  return (
    (r.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`cf_team_${code}=`))
      ?.split("=")[1] || ""
  );
}
export async function GET(
  r: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const code = (await params).code.toUpperCase();
    return json(
      roomState(
        code,
        (await currentTeacher(r.headers))?.email ?? null,
        token(r, code),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  r: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    sameOrigin(r);
    const code = (await params).code.toUpperCase();
    const b = await r.json();
    let t = token(r, code);
    if (b.action === "join") {
      if (!teamFor(code, t)) t = joinRoom(code, b.name);
      const response = json({ ok: true });
      response.headers.set(
        "Set-Cookie",
        `cf_team_${code}=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${new URL(r.url).protocol === "https:" ? "; Secure" : ""}`,
      );
      return response;
    }
    if (b.action === "answer") await submit(code, t, b.questionId, b.answer);
    else
      control(
        await teacherEmail(r),
        code,
        b.action,
        b.position,
        b.answerId,
        b.points,
      );
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

import { teacherEmail, sameOrigin, failure, json } from "@/lib/classroom-http";
import { ownQuiz, saveQuiz, generateQuiz, createRoom } from "@/lib/quiz/store";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(ownQuiz(await teacherEmail(r), (await params).id));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(r);
    const email = await teacherEmail(r);
    const { id } = await params;
    const b = await r.json();
    if (b.action === "generate")
      return json(await generateQuiz(email, id, b.revision));
    if (b.action === "save")
      return json(saveQuiz(email, id, b.quiz, b.revision));
    if (b.action === "room")
      return json({ code: createRoom(email, id, b.revision) });
    throw new Error("Unknown action.");
  } catch (e) {
    return failure(e);
  }
}

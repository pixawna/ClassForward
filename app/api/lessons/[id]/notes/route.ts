import { teacherEmail, sameOrigin, failure, json } from "@/lib/classroom-http";
import {
  notesState,
  saveDraft,
  publishNotes,
  changeSharing,
} from "@/lib/notes/store";
import { generateNotes } from "@/lib/notes/generate";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(notesState(await teacherEmail(r), (await params).id));
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
      return json(await generateNotes(email, id, b.revision));
    if (b.action === "save")
      return json(saveDraft(email, id, b.document, b.revision, b.basis));
    if (b.action === "publish")
      return json(publishNotes(email, id, b.revision, b.mode, b.emails));
    if (b.action === "sharing")
      return json(changeSharing(email, id, b.mode, b.emails));
    throw new Error("Unknown notes action.");
  } catch (e) {
    return failure(e);
  }
}

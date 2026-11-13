import { requireTeacher } from "@/lib/session";
import { notesState } from "@/lib/notes/store";
import { NotesStudio } from "./studio";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireTeacher();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <NotesStudio id={id} initial={notesState(user.email, id)} />
    </main>
  );
}

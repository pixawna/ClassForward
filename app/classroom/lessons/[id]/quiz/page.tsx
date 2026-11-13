import { requireTeacher } from "@/lib/session";
import { ownQuiz } from "@/lib/quiz/store";
import { getLesson } from "@/lib/lessons";
import { notFound } from "next/navigation";
import { QuizStudio } from "./studio";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireTeacher();
  const lesson = getLesson(user.email, id);
  if (!lesson) notFound();
  return (
    <main className="mx-auto max-w-5xl p-6">
      <QuizStudio
        id={id}
        initial={ownQuiz(user.email, id)}
        objectives={lesson.objectives}
      />
    </main>
  );
}

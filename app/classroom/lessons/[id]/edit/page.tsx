import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLesson } from "@/lib/lessons";
import { requireTeacher } from "@/lib/session";
import { settleStaleJob } from "@/lib/video/jobs";
import { updateLessonAction } from "../../actions";
import { LessonForm } from "../../new/LessonForm";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: "Edit lesson | ClassForward",
};

export default async function EditLessonPage({ params }: Props) {
  const { id } = await params;
  const teacher = await requireTeacher();
  const lesson = getLesson(teacher.email, id);
  if (!lesson) notFound();
  const video = settleStaleJob(lesson.id);

  return (
    <main className="relative mx-auto max-w-3xl px-6 pt-12 pb-24 sm:px-10 sm:pt-16">
      <Link
        href={`/classroom/lessons/${lesson.id}`}
        className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        &larr; Back to the lesson
      </Link>
      <h1 className="mt-6 font-serif text-[clamp(2.2rem,5vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.025em] [font-variation-settings:'opsz'_72]">
        Edit lesson
      </h1>
      <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-ink-soft">
        Change anything here. Your saved sources stay with the lesson.
      </p>
      {video?.title && (
        <p className="mt-6 rounded-xl border-2 border-dashed border-ink/25 bg-[#FBEFD0]/60 px-4 py-3 text-ink">
          This lesson has a story video. Saving keeps its script as it is; write a new story in the video studio when
          you want it to follow your changes.
        </p>
      )}
      <LessonForm
        action={updateLessonAction.bind(null, lesson.id)}
        initial={{
          topic: lesson.topic,
          level: lesson.level,
          durationSeconds: lesson.durationSeconds,
          priorKnowledge: lesson.priorKnowledge,
          objectives: lesson.objectives,
        }}
        submitLabel="Save changes"
        cancelHref={`/classroom/lessons/${lesson.id}`}
      />
    </main>
  );
}

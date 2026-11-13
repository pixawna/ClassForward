import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDuration } from "@/lib/lesson-limits";
import { getLesson, LEVEL_LABEL, listSources } from "@/lib/lessons";
import { requireTeacher } from "@/lib/session";
import { videoState } from "@/lib/video/state";
import { VideoStudio } from "./VideoStudio";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireTeacher();
  const lesson = getLesson(user.email, (await params).id);
  return { title: lesson ? `Story video: ${lesson.topic} | ClassForward` : "Story video | ClassForward" };
}

export default async function VideoPage({ params }: Props) {
  const { id } = await params;
  const user = await requireTeacher();
  const lesson = getLesson(user.email, id);
  if (!lesson) notFound();

  return (
    <main className="relative mx-auto max-w-6xl px-6 pt-12 pb-28 sm:px-10 sm:pt-16">
      <Link
        href={`/classroom/lessons/${lesson.id}`}
        className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        &larr; {lesson.topic}
      </Link>
      <h1 className="mt-6 font-serif text-[clamp(2.2rem,5vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.025em] [font-variation-settings:'opsz'_72]">
        Story video
      </h1>
      <p className="mt-5 flex flex-wrap gap-2 font-medium text-ink">
        <span className="rounded-full bg-[#F6D77A]/70 px-3.5 py-1">{LEVEL_LABEL[lesson.level]}</span>
        <span className="rounded-full bg-[#9CCDEB]/50 px-3.5 py-1">{formatDuration(lesson.durationSeconds)}</span>
      </p>

      <VideoStudio
        lessonId={lesson.id}
        topic={lesson.topic}
        durationSeconds={lesson.durationSeconds}
        objectives={lesson.objectives}
        sourceCount={listSources(lesson.id).length}
        initial={videoState(lesson)}
      />
    </main>
  );
}

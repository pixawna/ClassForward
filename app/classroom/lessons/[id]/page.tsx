import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLesson, LEVEL_LABEL, listSources } from "@/lib/lessons";
import { defaultQuery } from "@/lib/scrapy";
import { requireTeacher } from "@/lib/session";
import { paperCard } from "../../../components/ui";
import { SourceFinder } from "./SourceFinder";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireTeacher();
  const lesson = getLesson(user.email, id);
  return { title: lesson ? `${lesson.topic} | ClassForward` : "Lesson | ClassForward" };
}

export default async function LessonPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireTeacher();
  const lesson = getLesson(user.email, id);
  if (!lesson) notFound();
  const sources = listSources(lesson.id);

  return (
    <main className="relative mx-auto max-w-6xl px-6 pt-12 pb-24 sm:px-10 sm:pt-16">
      <Link href="/classroom" className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        &larr; All lessons
      </Link>

      <h1 className="mt-6 max-w-4xl font-serif text-[clamp(2.2rem,5vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.025em] [font-variation-settings:'opsz'_72]">
        {lesson.topic}
      </h1>
      <p className="mt-5 flex flex-wrap gap-2 font-medium text-ink">
        <span className="rounded-full bg-[#F6D77A]/70 px-3.5 py-1">{LEVEL_LABEL[lesson.level]}</span>
        <span className="rounded-full bg-[#9CCDEB]/50 px-3.5 py-1">{lesson.durationMinutes} minutes</span>
      </p>

      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="plan-title" className={`${paperCard} p-6 sm:p-8 lg:sticky lg:top-8`}>
          <h2 id="plan-title" className="sr-only">
            Lesson plan
          </h2>
          <h3 className="font-hand text-2xl text-redpen">What students already know</h3>
          <p className="mt-2 text-lg leading-relaxed whitespace-pre-line text-ink">{lesson.priorKnowledge}</p>

          <h3 className="mt-8 font-hand text-2xl text-redpen">Learning objectives</h3>
          <p className="text-ink-soft">By the end of the lesson, students can:</p>
          <ol className="mt-3 space-y-2.5">
            {lesson.objectives.map((o, i) => (
              <li key={i} className="flex gap-3 text-lg leading-snug text-ink">
                <span aria-hidden="true" className="w-5 shrink-0 font-hand text-xl text-ink-soft">
                  {i + 1}.
                </span>
                <span>{o}</span>
              </li>
            ))}
          </ol>
        </section>

        <SourceFinder
          lessonId={lesson.id}
          level={lesson.level}
          defaultQuery={defaultQuery(lesson)}
          initialSaved={sources}
          searchOnOpen={sources.length === 0 && query.new === "1"}
        />
      </div>
    </main>
  );
}

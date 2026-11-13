import type { Metadata } from "next";
import Link from "next/link";
import { formatDuration } from "@/lib/lesson-limits";
import { LEVEL_LABEL, listLessons } from "@/lib/lessons";
import { requireTeacher } from "@/lib/session";
import { redButton } from "../components/ui";

export const metadata: Metadata = {
  title: "Your classroom | ClassForward",
};

export default async function ClassroomPage() {
  const user = await requireTeacher();
  const lessons = listLessons(user.email);
  const firstName = user.name?.split(" ")[0] || "teacher";

  return (
    <main className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 sm:px-10 sm:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-[clamp(2.4rem,5.4vw,4.5rem)] leading-[1.05] font-medium tracking-[-0.025em] [font-variation-settings:'opsz'_72]">
            Welcome to class, {firstName}.
          </h1>
          <p className="mt-4 text-lg text-ink-soft">Signed in as {user.email}</p>
        </div>
        {lessons.length > 0 && (
          <Link href="/classroom/lessons/new" className={redButton}>
            Plan a new lesson
          </Link>
        )}
      </div>

      {lessons.length === 0 ? (
        <section
          aria-labelledby="board-title"
          className="mt-12 rounded-[14px] border-[3px] border-ink bg-[#B98B5A] p-3 shadow-[0_6px_0_var(--color-ink)] sm:p-4"
        >
          <div className="rounded-[6px] border-2 border-ink bg-board px-6 py-12 text-chalk sm:px-12 sm:py-16">
            <p className="font-hand text-xl text-[#F6D77A] sm:text-2xl">Today&apos;s lesson</p>
            <h2 id="board-title" className="mt-2 font-hand text-4xl leading-tight sm:text-5xl">
              Your first lesson goes here.
            </h2>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-chalk/80">
              Tell ClassForward what you&apos;re teaching and who it&apos;s for. Then find sources from the live web
              to teach from and cite.
            </p>
            <Link href="/classroom/lessons/new" className={`${redButton} mt-8 border-chalk`}>
              Plan your first lesson
            </Link>
          </div>
          <div aria-hidden="true" className="mt-2.5 flex justify-end gap-2 pr-8">
            <span className="h-2 w-8 rounded-full bg-chalk" />
            <span className="h-2 w-6 rounded-full bg-[#F6D77A]" />
            <span className="h-2 w-5 rounded-full bg-[#9CCDEB]" />
          </div>
        </section>
      ) : (
        <section aria-labelledby="lessons-title" className="mt-12">
          <h2 id="lessons-title" className="font-serif text-2xl font-medium">
            Your lessons
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/classroom/lessons/${lesson.id}`}
                  className="cf-index-card group block h-full rounded-xl border-2 border-ink p-6 pt-8 shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--color-ink)]"
                >
                  <h3 className="font-serif text-2xl leading-snug font-medium tracking-[-0.01em] text-ink group-hover:underline group-hover:decoration-redpen group-hover:decoration-2 group-hover:underline-offset-4">
                    {lesson.topic}
                  </h3>
                  <p className="mt-3 flex flex-wrap gap-2 text-sm font-medium text-ink">
                    <span className="rounded-full bg-[#F6D77A]/70 px-3 py-1">{LEVEL_LABEL[lesson.level]}</span>
                    <span className="rounded-full bg-[#9CCDEB]/50 px-3 py-1">{formatDuration(lesson.durationSeconds, "short")}</span>
                  </p>
                  <p className="mt-4 text-ink-soft">
                    {lesson.objectives.length} {lesson.objectives.length === 1 ? "objective" : "objectives"},{" "}
                    {lesson.sourceCount} {lesson.sourceCount === 1 ? "source" : "sources"} saved
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

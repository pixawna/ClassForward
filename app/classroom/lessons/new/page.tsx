import type { Metadata } from "next";
import Link from "next/link";
import { LessonForm } from "./LessonForm";

export const metadata: Metadata = {
  title: "Plan a lesson | ClassForward",
};

export default function NewLessonPage() {
  return (
    <main className="relative mx-auto max-w-3xl px-6 pt-12 pb-24 sm:px-10 sm:pt-16">
      <Link href="/classroom" className="font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        &larr; Back to your classroom
      </Link>
      <h1 className="mt-6 font-serif text-[clamp(2.2rem,5vw,3.75rem)] leading-[1.05] font-medium tracking-[-0.025em] [font-variation-settings:'opsz'_72]">
        Plan a lesson
      </h1>
      <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-ink-soft">
        The more ClassForward knows about your class, the better the sources it finds. Your level and objectives decide
        which sources come first.
      </p>
      <LessonForm />
    </main>
  );
}

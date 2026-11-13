import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignOutButton } from "../components/SignOutButton";
import { SiteHeader } from "../components/SiteHeader";
import { Avatar } from "../components/UserBadge";

export const metadata: Metadata = {
  title: "Your classroom | ClassForward",
};

/**
 * Where teachers land after signing in with Google. A starting point:
 * the chalkboard is where lessons, notes and quizzes will go.
 */
export default async function ClassroomPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { user } = session;
  const firstName = user.name?.split(" ")[0] || "teacher";

  return (
    <div className="relative min-h-svh">
      <div aria-hidden="true" className="cf-notebook pointer-events-none absolute inset-x-0 top-0 h-[60%]" />

      <SiteHeader>
        <span className="hidden items-center gap-2.5 rounded-full bg-white/70 py-1.5 pr-4 pl-1.5 font-medium text-ink sm:inline-flex">
          <Avatar user={user} />
          {user.name || user.email}
        </span>
        <SignOutButton />
      </SiteHeader>

      <main className="relative mx-auto max-w-5xl px-6 pt-16 pb-24 sm:px-10 sm:pt-20">
        <h1 className="font-serif text-[clamp(2.4rem,5.4vw,4.5rem)] leading-[1.05] font-medium tracking-[-0.025em] [font-variation-settings:'opsz'_72]">
          Welcome to class, {firstName}.
        </h1>
        <p className="mt-4 text-lg text-ink-soft">Signed in as {user.email}</p>

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
              Story lessons, shared study notes and quizzes for your class will show up on this board.
            </p>
          </div>
          <div aria-hidden="true" className="mt-2.5 flex justify-end gap-2 pr-8">
            <span className="h-2 w-8 rounded-full bg-chalk" />
            <span className="h-2 w-6 rounded-full bg-[#F6D77A]" />
            <span className="h-2 w-5 rounded-full bg-[#9CCDEB]" />
          </div>
        </section>
      </main>
    </div>
  );
}

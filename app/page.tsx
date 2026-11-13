import Link from "next/link";
import { headers } from "next/headers";
import { auth, type Session } from "@/lib/auth";
import { ClassroomScene } from "./components/classroom/ClassroomScene";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import { GitHubIcon } from "./components/icons";
import { SiteHeader } from "./components/SiteHeader";
import { Avatar } from "./components/UserBadge";

const GITHUB_URL = "https://github.com/pixawna/ClassForward";

/** Signed out: the red Google button. Signed in: a way back to their classroom. */
function ClassroomEntry({ session, signedOutLabel, className = "" }: { session: Session | null; signedOutLabel: React.ReactNode; className?: string }) {
  if (!session) return <GoogleSignInButton className={className}>{signedOutLabel}</GoogleSignInButton>;
  return (
    <Link
      href="/classroom"
      className={`inline-flex items-center gap-2.5 rounded-full border-2 border-ink bg-redpen py-1.5 pr-4 pl-1.5 text-[15px] font-semibold whitespace-nowrap text-white shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow,background-color] hover:bg-redpen-deep active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-ink)] sm:pr-5 sm:text-base ${className}`}
    >
      <Avatar user={session.user} />
      Your classroom
    </Link>
  );
}

const FEATURES = [
  {
    title: "Lessons that read like stories",
    body: "Each topic becomes a short story with a character to follow, so the ideas arrive in an order your class can remember.",
    icon: (
      <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true">
        <path d="M6 16 Q20 10 32 18 Q44 10 58 16 V50 Q44 44 32 52 Q20 44 6 50 Z" fill="#FFFDF8" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
        <path d="M32 18 V52" stroke="#1F2A44" strokeWidth="3" />
        <path d="M13 24 q8 -3 13 0 M13 31 q8 -3 13 0 M13 38 q6 -2 10 0" stroke="#4A5571" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M45 22 C49 28 52 31 52 35 A7 7 0 1 1 38 35 C38 31 41 28 45 22 Z" fill="#9CCDEB" stroke="#1F2A44" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Study notes they can share",
    body: "Every lesson leaves behind notes students can keep, revise from and pass to a classmate who missed the day.",
    icon: (
      <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true">
        <path d="M6 30 L58 10 L40 56 L30 38 Z" fill="#FFFDF8" stroke="#1F2A44" strokeWidth="3" strokeLinejoin="round" />
        <path d="M30 38 L58 10" stroke="#1F2A44" strokeWidth="2.5" />
        <path d="M30 38 L28 50 L36 44" fill="#E6DCC8" stroke="#1F2A44" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M4 52 q6 -8 14 -8" stroke="#D93A2B" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="3 5" />
      </svg>
    ),
  },
  {
    title: "Quizzes in the middle of class",
    body: "Ask a quick question while the story is still fresh and see who is following before you turn the page.",
    icon: (
      <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true">
        <rect x="10" y="6" width="44" height="52" rx="4" fill="#FFFDF8" stroke="#1F2A44" strokeWidth="3" />
        <circle cx="21" cy="22" r="4.5" fill="none" stroke="#1F2A44" strokeWidth="2.5" />
        <circle cx="21" cy="35" r="4.5" fill="#4E9F6E" stroke="#1F2A44" strokeWidth="2.5" />
        <circle cx="21" cy="48" r="4.5" fill="none" stroke="#1F2A44" strokeWidth="2.5" />
        <path d="M31 22 h14 M31 35 h12 M31 48 h14" stroke="#4A5571" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M40 30 l5 5 l12 -14" fill="none" stroke="#D93A2B" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const [session, params] = await Promise.all([auth.api.getSession({ headers: await headers() }), searchParams]);
  const signInFailed = !session && params.signin === "failed";

  return (
    <>
      <div className="relative flex min-h-svh flex-col">
        <div aria-hidden="true" className="cf-notebook pointer-events-none absolute inset-x-0 top-0 h-[78%]" />

        <SiteHeader>
          <a
            href="#how"
            className="hidden rounded-full bg-white/70 px-5 py-2.5 font-medium text-ink transition-colors hover:bg-white md:inline-flex"
          >
            How it works
          </a>
          <a
            href={GITHUB_URL}
            aria-label="ClassForward on GitHub"
            className="hidden size-11 items-center justify-center rounded-full bg-white/70 text-ink transition-colors hover:bg-white md:inline-flex"
          >
            <GitHubIcon />
          </a>
          <ClassroomEntry
            session={session}
            signedOutLabel={
              <>
                <span className="sm:hidden">Sign in</span>
                <span className="hidden sm:inline">Sign in with Google</span>
              </>
            }
          />
        </SiteHeader>

        <main className="relative flex flex-1 flex-col">
          <section className="flex flex-1 flex-col items-center justify-center px-6 pt-10 pb-8 text-center sm:pt-6">
            <h1 className="font-serif text-[clamp(2.6rem,6.4vw,5.75rem)] leading-[1.04] font-medium tracking-[-0.025em] text-ink [font-variation-settings:'opsz'_72]">
              <span className="sr-only">Turn every lesson into a story.</span>
              <span aria-hidden="true">
                Turn every lesson
                <span className="mt-[0.28em] block">
                into a{" "}
                <span className="cf-struck">
                  lecture
                  <svg className="cf-strike" viewBox="0 0 320 30" preserveAspectRatio="none">
                    <path
                      d="M6 20 C70 10 120 22 180 14 S270 8 314 12"
                      pathLength={1}
                      fill="none"
                      stroke="var(--color-redpen)"
                      strokeWidth="9"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="cf-correction">story</span>
                </span>
                .
                </span>
              </span>
            </h1>
            <p className="mt-7 max-w-[40rem] text-lg leading-relaxed text-ink-soft sm:text-xl">
              Story-driven lessons, notes students can share and quick quizzes that show who&apos;s keeping up.
              Same classroom, a better way to teach it.
            </p>
            {signInFailed && (
              <p role="alert" className="mt-5 font-hand text-xl text-redpen sm:text-2xl">
                Google sign-in didn&apos;t finish. Please try again.
              </p>
            )}
          </section>

          <ClassroomScene />
        </main>
      </div>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24 sm:px-10 sm:py-32">
        <h2 className="max-w-2xl font-serif text-[clamp(2rem,4vw,3.25rem)] leading-[1.1] font-medium tracking-[-0.02em] [font-variation-settings:'opsz'_60]">
          What your class gets with every lesson
        </h2>
        <div className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-10">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t-2 border-dashed border-ink/20 pt-8">
              {f.icon}
              <h3 className="mt-5 font-serif text-2xl leading-snug font-medium tracking-[-0.01em]">{f.title}</h3>
              <p className="mt-3 max-w-[30ch] text-lg leading-relaxed text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="start" className="scroll-mt-8 bg-board px-6 py-24 text-center text-chalk sm:py-28">
        <p className="font-hand text-2xl text-[#F6D77A]">class is about to start</p>
        <h2 className="mx-auto mt-3 max-w-3xl font-serif text-[clamp(2rem,4.4vw,3.5rem)] leading-[1.1] font-medium tracking-[-0.02em] text-chalk [font-variation-settings:'opsz'_60]">
          Bring ClassForward to your classroom.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-chalk/80">
          {session
            ? "You're signed in. Your classroom is ready when you are."
            : "Sign in with your Google account to set up your classroom."}
        </p>
        <ClassroomEntry
          session={session}
          signedOutLabel="Continue with Google"
          className="mt-9 border-chalk shadow-[0_4px_0_#141d18] active:shadow-[0_1px_0_#141d18]"
        />
      </section>

      <footer className="flex flex-col items-center justify-between gap-4 px-6 py-8 text-ink-soft sm:flex-row sm:px-10">
        <p>
          &copy; 2026 ClassForward <span className="font-hand text-lg text-redpen">little stories, big lessons</span>
        </p>
        <a href={GITHUB_URL} className="inline-flex items-center gap-2 hover:text-ink">
          <GitHubIcon />
          GitHub
        </a>
      </footer>
    </>
  );
}

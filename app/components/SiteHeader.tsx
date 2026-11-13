import Link from "next/link";
import { LogoMark } from "./icons";

export function SiteHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-5 sm:px-10 sm:pt-7">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2.5 rounded-full border-2 border-ink/10 bg-white/70 py-1.5 pr-5 pl-2 backdrop-blur-sm"
      >
        <LogoMark />
        <span className="font-serif text-xl font-semibold tracking-[-0.01em] text-ink">ClassForward</span>
      </Link>
      <nav aria-label="Main" className="flex items-center gap-2.5 sm:gap-3">
        {children}
      </nav>
    </header>
  );
}

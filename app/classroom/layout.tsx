import Link from "next/link";
import { requireTeacher } from "@/lib/session";
import { SignOutButton } from "../components/SignOutButton";
import { SiteHeader } from "../components/SiteHeader";
import { Avatar } from "../components/UserBadge";

export default async function ClassroomLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTeacher();
  return (
    <div className="relative min-h-svh">
      <div aria-hidden="true" className="cf-notebook pointer-events-none absolute inset-x-0 top-0 h-[460px]" />
      <SiteHeader>
        <Link
          href="/classroom"
          className="hidden items-center gap-2.5 rounded-full bg-white/70 py-1.5 pr-4 pl-1.5 font-medium text-ink transition-colors hover:bg-white sm:inline-flex"
        >
          <Avatar user={user} />
          {user.name || user.email}
        </Link>
        <SignOutButton />
      </SiteHeader>
      {children}
    </div>
  );
}

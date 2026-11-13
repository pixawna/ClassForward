import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sharedLesson } from "@/lib/notes/store";
import { NotesReader } from "@/app/components/NotesReader";
import { GoogleSignInButton } from "@/app/components/GoogleSignInButton";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const result = sharedLesson(
    token,
    session
      ? { email: session.user.email, emailVerified: session.user.emailVerified }
      : null,
  );
  if (result.status !== "allowed")
    return (
      <main className="mx-auto max-w-3xl p-10">
        <h1 className="font-serif text-3xl">
          {result.status === "signin"
            ? "Sign in to view this lesson"
            : result.status === "denied"
              ? "This lesson is not shared with your account"
              : "This lesson is not available"}
        </h1>
        {result.status === "signin" && (
          <GoogleSignInButton callbackURL={`/share/${token}`}>
            Continue with Google
          </GoogleSignInButton>
        )}
      </main>
    );
  const s = result.snapshot;
  return (
    <main className="mx-auto max-w-4xl p-6">
      <NotesReader
        document={s.document}
        timestamps={s.timestamps}
        citations={s.citations}
        videoURL={`/api/share/${token}/video`}
      />
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { GoogleG } from "./icons";

/**
 * The red-pen button, now for signing in. Sends the teacher to Google and
 * brings them back to their classroom.
 */
export function GoogleSignInButton({
  children,
  className = "",
  callbackURL = "/classroom",
}: {
  children: React.ReactNode;
  className?: string;
  callbackURL?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: "/?signin=failed",
    });
    // On success the browser is already on its way to Google.
    if (error) {
      setPending(false);
      router.push("/?signin=failed");
    }
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex cursor-pointer items-center gap-2.5 rounded-full border-2 border-ink bg-redpen py-1.5 pr-4 pl-1.5 text-[15px] font-semibold whitespace-nowrap text-white shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow,background-color] hover:bg-redpen-deep active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-ink)] disabled:cursor-wait disabled:opacity-80 sm:pr-5 sm:text-base ${className}`}
    >
      <span className="grid size-8 place-items-center rounded-full bg-white">
        <GoogleG />
      </span>
      {pending ? "Opening Google..." : children}
    </button>
  );
}

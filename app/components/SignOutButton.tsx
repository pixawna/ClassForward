"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="cursor-pointer rounded-full border-2 border-ink/15 bg-white/70 px-4 py-2 font-medium whitespace-nowrap text-ink transition-colors hover:bg-white disabled:cursor-wait sm:px-5 sm:py-2.5"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}

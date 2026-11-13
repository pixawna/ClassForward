import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** The signed-in teacher, or a redirect to the home page. */
export async function requireTeacher() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  return session.user;
}

/** For route handlers: the signed-in teacher or null (no redirect). */
export async function currentTeacher(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}

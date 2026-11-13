import "server-only";
import { currentTeacher } from "./session";
export class ClassroomError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function teacherEmail(request: Request) {
  const user = await currentTeacher(request.headers);
  if (!user) throw new ClassroomError("Please sign in.", 401);
  return user.email;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ClassroomError("Request origin is not allowed.", 403);
}
export function failure(error: unknown) {
  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 400;
  return Response.json(
    { error: error instanceof Error ? error.message : "Please try again." },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function json(value: unknown) {
  return Response.json(value, { headers: { "Cache-Control": "no-store" } });
}

import { redirect } from "next/navigation";
export function GET(r: Request) {
  const code = new URL(r.url).searchParams.get("code")?.toUpperCase();
  if (!code || !/^[A-F0-9]{8}$/.test(code)) redirect("/quiz");
  redirect(`/quiz/${code}`);
}

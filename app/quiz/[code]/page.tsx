import { QuizRoom } from "./room";
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <QuizRoom code={(await params).code.toUpperCase()} />
    </main>
  );
}

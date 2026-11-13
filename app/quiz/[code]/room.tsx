"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { roomState } from "@/lib/quiz/store";
import { paperCard, quietButton, redButton } from "@/app/components/ui";
type State = ReturnType<typeof roomState>;
export function QuizRoom({ code }: { code: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const r = await fetch(`/api/quiz/${code}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        const v = await r.json();
        if (!r.ok) throw Error(v.error);
        if (alive) {
          setState(v);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Connection interrupted.");
      }
      if (alive) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [code]);
  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/quiz/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ action, position: state?.position, ...extra }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      const fresh = await fetch(`/api/quiz/${code}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (fresh.ok) setState(await fresh.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return <p role="status">{error || "Connecting to your classroom…"}</p>;
  const q = state.question;
  const currentAnswers = state.answers.filter(
    (a) => a.question === q?.id || (state.teacher && a.evaluation.review),
  );
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-4xl">{state.title}</h1>
      <p className="font-hand text-3xl">
        Room {code} · {state.phase}
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {state.teacher && (
        <section className={`${paperCard} p-5`}>
          <h2 className="font-serif text-2xl">Invite the class</h2>
          <p>
            Open{" "}
            {typeof location !== "undefined"
              ? `${location.origin}/quiz/${code}`
              : ""}{" "}
            or enter the code at /quiz. For phones, open ClassForward using your
            laptop’s LAN address before sharing.
          </p>
          {/* Generated locally; no classroom URLs sent to an external QR service. */}
          <Image
            unoptimized
            src={`/api/quiz/${code}/qr`}
            alt="Scan to join this quiz room"
            width={160}
            height={160}
          />
          <p className="mt-3 font-semibold">
            Recommended next step: {state.recommendation}
          </p>
          <p>
            {state.teams.length} teams joined · {state.submitted} submissions
            this round
          </p>
          <p>{state.teams.map((t) => t.name).join(", ")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {(state.phase === "lobby" || state.phase === "revealed") &&
              state.position + 1 < state.total && (
                <button
                  disabled={busy}
                  className={redButton}
                  onClick={() => void run("next")}
                >
                  {state.phase === "lobby"
                    ? "Start first question"
                    : "Next question"}
                </button>
              )}
            {state.phase === "question" && (
              <button
                disabled={busy}
                className={redButton}
                onClick={() => void run("reveal")}
              >
                Close round and reveal answers
              </button>
            )}
            {state.phase === "revealed" && (
              <>
                <button
                  disabled={busy}
                  className={quietButton}
                  onClick={() => void run("followup")}
                >
                  Launch targeted follow-up
                </button>
                {state.position === state.total - 1 && (
                  <button
                    disabled={busy}
                    className={redButton}
                    onClick={() => void run("finish")}
                  >
                    Finish quiz
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}
      {!state.teacher && !state.team && state.phase === "lobby" && (
        <form
          className={`${paperCard} space-y-3 p-5`}
          onSubmit={(e) => {
            e.preventDefault();
            void run("join", {
              name: new FormData(e.currentTarget).get("name"),
            });
          }}
        >
          <label>
            Choose your team name
            <input
              name="name"
              required
              maxLength={60}
              className="block w-full rounded-xl border p-3"
            />
          </label>
          <button disabled={busy} className={redButton}>
            Join as a team
          </button>
          <p>Choose one device to submit answers for your team.</p>
        </form>
      )}
      {state.team && <p>Playing as {state.team.name}</p>}
      {q && (
        <section className={`${paperCard} space-y-4 p-6`}>
          <h2 className="font-serif text-2xl">
            Question {state.position + 1} of {state.total}
          </h2>
          <p className="text-xl">{q.prompt}</p>
          {q.options.map((o, i) => (
            <p key={i}>
              {String.fromCharCode(65 + i)}. {o}
            </p>
          ))}
          {state.team && state.phase === "question" && !state.hasSubmitted && (
            <form
              key={q.id}
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run("answer", {
                  questionId: q.id,
                  answer: new FormData(e.currentTarget).get("answer"),
                });
              }}
            >
              {q.type === "choice" ? (
                <select
                  name="answer"
                  required
                  className="block w-full rounded-xl border bg-white p-3"
                >
                  <option value="">Choose together…</option>
                  {q.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  name="answer"
                  required
                  maxLength={4000}
                  placeholder="Explain your team’s reasoning…"
                  className="block w-full rounded-xl border bg-white p-3"
                />
              )}
              <button disabled={busy} className={redButton}>
                Submit team answer
              </button>
            </form>
          )}
          {state.hasSubmitted && state.phase === "question" && (
            <p>
              Answer received. Discuss while the teacher waits for the class.
            </p>
          )}
          {q.answer && (
            <div className="rounded-xl bg-green-50 p-4">
              <h3 className="font-semibold">Reviewed answer</h3>
              <p>{q.answer}</p>
              <p>{q.explanation}</p>
            </div>
          )}
        </section>
      )}
      {state.followUp && (
        <section className="rounded-xl bg-yellow-100 p-6">
          <h2 className="font-hand text-3xl">Let’s try another explanation</h2>
          <p className="whitespace-pre-wrap">{state.followUp}</p>
        </section>
      )}
      <section className={`${paperCard} p-5`}>
        <h2 className="font-serif text-2xl">
          {state.phase === "finished"
            ? "Final team results"
            : "Team leaderboard"}
        </h2>
        <p>
          100 points for correct answers, 50 for partial explanations. Uncertain
          judgments earn points only after teacher review.
        </p>
        <ol className="list-decimal pl-6">
          {state.leaderboard.map((t) => (
            <li key={t.name}>
              {t.name}: {t.points} points
            </li>
          ))}
        </ol>
      </section>
      {currentAnswers.map((a) => (
        <section key={a.id} className={`${paperCard} space-y-2 p-4`}>
          <h3>{a.teamName}</h3>
          <p>{a.answer}</p>
          <p>
            {a.evaluation.category} ·{" "}
            {a.evaluation.confidence === null
              ? "Confidence unavailable"
              : `${Math.round(a.evaluation.confidence * 100)}% confidence`}{" "}
            · {a.evaluation.points} points
          </p>
          <p>{a.evaluation.reason}</p>
          {a.evaluation.category === "misconception" && q?.misconception && (
            <p>Concept to revisit: {q.misconception}</p>
          )}
          {state.teacher && a.evaluation.review && (
            <div>
              <strong>Needs your review: </strong>
              {[0, 50, 100].map((points) => (
                <button
                  disabled={busy}
                  className={quietButton}
                  key={points}
                  onClick={() => void run("review", { answerId: a.id, points })}
                >
                  Award {points}
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
      {state.teacher && state.phase !== "lobby" && (
        <section className={`${paperCard} p-5`}>
          <h2 className="font-serif text-2xl">Concepts to revisit</h2>
          <p>
            This summary reflects team responses, not individual mastery.
            Results remain saved at this room link.
          </p>
          {state.concepts.map((c, i) => (
            <p key={i}>
              {c.objectiveLabel} — {c.question}: {c.needsHelp} of {c.responses}{" "}
              responses need clarification or review.
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

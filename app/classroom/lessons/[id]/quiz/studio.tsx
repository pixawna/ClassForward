"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Quiz, Question } from "@/lib/quiz/types";
import { paperCard, redButton, quietButton } from "@/app/components/ui";
export function QuizStudio({
  id,
  initial,
  objectives,
}: {
  id: string;
  initial: { quiz: Quiz; revision: number } | null;
  objectives: string[];
}) {
  const router = useRouter();
  const [quiz, setQuiz] = useState(initial?.quiz ?? null);
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/lessons/${id}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(150000),
        body: JSON.stringify({ action, quiz, revision }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      if (action === "room") {
        router.push(`/quiz/${v.code}`);
        return;
      }
      setQuiz(v.quiz);
      setRevision(v.revision);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function change(i: number, patch: Partial<Question>) {
    setQuiz((q) =>
      q
        ? {
            ...q,
            questions: q.questions.map((v, j) =>
              i === j ? { ...v, ...patch } : v,
            ),
          }
        : q,
    );
    setDirty(true);
  }
  const input = "block w-full rounded-lg border border-ink/30 bg-white p-3";
  return (
    <div className="space-y-6">
      <Link className="underline" href={`/classroom/lessons/${id}`}>
        ← Lesson
      </Link>
      <h1 className="font-serif text-4xl">Classroom team quiz</h1>
      <p>
        Review the questions and answer keys before opening a room. Existing
        rooms keep their reviewed questions.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className={redButton}
          disabled={busy}
          onClick={() => {
            if (!quiz || confirm("Replace this quiz with a new draft?"))
              void run("generate");
          }}
        >
          {busy ? "Working…" : "Generate questions"}
        </button>
        <button
          className={quietButton}
          disabled={busy || !dirty}
          onClick={() => void run("save")}
        >
          Save reviewed edits
        </button>
        <button
          className={redButton}
          disabled={busy || !quiz || dirty}
          onClick={() => void run("room")}
        >
          Open quiz room
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {quiz && (
        <>
          <label>
            Quiz title
            <input
              className={input}
              value={quiz.title}
              onChange={(e) => {
                setQuiz({ ...quiz, title: e.target.value });
                setDirty(true);
              }}
            />
          </label>
          {quiz.questions.map((q, i) => (
            <fieldset key={q.id} className={`${paperCard} space-y-4 p-5`}>
              <legend>
                Question {i + 1} ·{" "}
                {q.type === "choice" ? "Multiple choice" : "Short explanation"}
              </legend>
              <label className="block">
                Learning objective
                <select
                  className={input}
                  value={q.objective}
                  onChange={(e) =>
                    change(i, { objective: Number(e.target.value) })
                  }
                >
                  {objectives.map((o, j) => (
                    <option key={j} value={j}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  "prompt",
                  "answer",
                  "explanation",
                  "rubric",
                  "misconception",
                  "followUp",
                ] as const
              ).map((k) => (
                <label className="block" key={k}>
                  {
                    {
                      prompt: "Question",
                      answer: "Answer key",
                      explanation: "Explanation after reveal",
                      rubric: "Evaluation rubric",
                      misconception: "Likely misconception",
                      followUp: "Targeted follow-up",
                    }[k]
                  }
                  <textarea
                    className={input}
                    value={q[k]}
                    onChange={(e) => change(i, { [k]: e.target.value })}
                  />
                </label>
              ))}
              {q.type === "choice" && (
                <label className="block">
                  Options (one per line; answer key must match one exactly)
                  <textarea
                    className={input}
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      change(i, { options: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
            </fieldset>
          ))}
        </>
      )}
    </div>
  );
}

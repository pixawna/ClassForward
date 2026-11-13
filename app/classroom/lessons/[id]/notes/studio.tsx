"use client";
import Link from "next/link";
import { useState } from "react";
import type { NotesState, NotesDocument, ShareMode } from "@/lib/notes/types";
import { NotesReader } from "@/app/components/NotesReader";
import { paperCard, redButton, quietButton } from "@/app/components/ui";
const lines = (s: string) =>
  s
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
export function NotesStudio({
  id,
  initial,
}: {
  id: string;
  initial: NotesState;
}) {
  const [state, setState] = useState(initial);
  const [doc, setDoc] = useState<NotesDocument | null>(
    initial.draft?.document ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<ShareMode>(
    initial.sharing.mode === "private" ? "anyone" : initial.sharing.mode,
  );
  const [emails, setEmails] = useState(initial.sharing.emails.join("\n"));
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  async function action(action: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "publish" && dirty)
        throw Error("Save your edits before publishing.");
      const r = await fetch(`/api/lessons/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(150000),
        body: JSON.stringify({
          action: action === "access" ? "sharing" : action,
          document: doc
            ? {
                ...doc,
                summary: doc.summary.filter((s) => s.trim()),
                sections: doc.sections.map((s) => ({
                  ...s,
                  keyConcepts: s.keyConcepts.filter((v) => v.trim()),
                  examples: s.examples.filter((v) => v.trim()),
                })),
              }
            : null,
          revision: state.draft?.revision ?? 0,
          basis: state.draft?.basis,
          mode: action === "sharing" ? "private" : mode,
          emails: lines(emails),
        }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      setState(v);
      if (action === "save" || action === "generate") {
        setDoc(v.draft.document);
        setDirty(false);
      }
      setMessage(
        action === "publish"
          ? "Published. Viewers see this reviewed version."
          : action === "sharing"
            ? "Sharing turned off."
            : action === "access"
              ? "Sharing updated for the published lesson."
              : "Notes saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function edit(next: NotesDocument) {
    setDoc(next);
    setDirty(true);
  }
  const input = "block w-full rounded-lg border border-ink/30 bg-white p-3";
  return (
    <div className="cf-notes-studio space-y-6">
      <Link href={`/classroom/lessons/${id}`} className="underline">
        ← Lesson
      </Link>
      <h1 className="font-serif text-4xl">Study notes</h1>
      <p>
        Generate from the video script, review the details, then publish a
        version students can keep.
      </p>
      {!state.hasScript && <p>Write the video script first.</p>}
      {state.stale && (
        <p role="alert">
          The script has changed. Regenerate notes before publishing.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy || !state.hasScript}
          className={redButton}
          onClick={() => {
            if (!dirty || confirm("Replace your unsaved edits?"))
              void action("generate");
          }}
        >
          {busy ? "Working…" : doc ? "Regenerate notes" : "Generate notes"}
        </button>
        {doc && (
          <>
            <button
              disabled={busy || !dirty}
              className={quietButton}
              onClick={() => void action("save")}
            >
              Save edits
            </button>
            <button
              className={quietButton}
              onClick={() => setPreview(!preview)}
            >
              {preview ? "Edit notes" : "Preview notes"}
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p role="status">{message}</p>
      {doc &&
        (preview ? (
          <NotesReader
            document={doc}
            timestamps={state.timestamps}
            citations={state.citations}
            captionsURL={`/api/lessons/${id}/video/captions`}
            videoURL={
              state.canPublish ? `/api/lessons/${id}/video/file` : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            <label>
              Notes title
              <input
                className={input}
                value={doc.title}
                onChange={(e) => edit({ ...doc, title: e.target.value })}
              />
            </label>
            {doc.sections.map((s, i) => (
              <fieldset key={i} className={`${paperCard} space-y-3 p-5`}>
                <legend>Section {i + 1}</legend>
                {(["title", "explanation"] as const).map((k) => (
                  <label key={k} className="block capitalize">
                    {k}
                    <textarea
                      className={input}
                      value={s[k]}
                      onChange={(e) =>
                        edit({
                          ...doc,
                          sections: doc.sections.map((v, j) =>
                            i === j ? { ...v, [k]: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                {(["keyConcepts", "examples"] as const).map((k) => (
                  <label className="block" key={k}>
                    {k === "keyConcepts" ? "Key concepts" : "Examples"} (one per
                    line)
                    <textarea
                      className={input}
                      value={s[k].join("\n")}
                      onChange={(e) =>
                        edit({
                          ...doc,
                          sections: doc.sections.map((v, j) =>
                            i === j
                              ? { ...v, [k]: e.target.value.split("\n") }
                              : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                {(["definitions", "formulas"] as const).map((k) => (
                  <div key={k}>
                    <h3 className="font-semibold capitalize">{k}</h3>
                    {s[k].map((pair, j) => (
                      <div key={j} className="grid gap-2 sm:grid-cols-2">
                        <input
                          aria-label={k === "definitions" ? "Term" : "Formula"}
                          className={input}
                          value={"term" in pair ? pair.term : pair.expression}
                          onChange={(e) =>
                            edit({
                              ...doc,
                              sections: doc.sections.map((v, n) =>
                                i === n
                                  ? {
                                      ...v,
                                      [k]: v[k].map((p, m) =>
                                        m === j
                                          ? {
                                              ...p,
                                              [k === "definitions"
                                                ? "term"
                                                : "expression"]: e.target.value,
                                            }
                                          : p,
                                      ),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label="Meaning"
                          className={input}
                          value={pair.meaning}
                          onChange={(e) =>
                            edit({
                              ...doc,
                              sections: doc.sections.map((v, n) =>
                                i === n
                                  ? {
                                      ...v,
                                      [k]: v[k].map((p, m) =>
                                        m === j
                                          ? { ...p, meaning: e.target.value }
                                          : p,
                                      ),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          className={quietButton}
                          onClick={() =>
                            edit({
                              ...doc,
                              sections: doc.sections.map((v, n) =>
                                i === n
                                  ? {
                                      ...v,
                                      [k]: v[k].filter((_, m) => m !== j),
                                    }
                                  : v,
                              ),
                            })
                          }
                        >
                          Remove{" "}
                          {k === "definitions" ? "definition" : "formula"}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={quietButton}
                      onClick={() =>
                        edit({
                          ...doc,
                          sections: doc.sections.map((v, n) =>
                            i === n
                              ? {
                                  ...v,
                                  [k]: [
                                    ...v[k],
                                    k === "definitions"
                                      ? { term: "", meaning: "" }
                                      : { expression: "", meaning: "" },
                                  ],
                                }
                              : v,
                          ),
                        })
                      }
                    >
                      Add {k === "definitions" ? "definition" : "formula"}
                    </button>
                  </div>
                ))}
                <label className="block">
                  Linked video scene
                  <select
                    className={input}
                    value={s.sceneId}
                    onChange={(e) =>
                      edit({
                        ...doc,
                        sections: doc.sections.map((v, j) =>
                          i === j ? { ...v, sceneId: e.target.value } : v,
                        ),
                      })
                    }
                  >
                    {state.scenes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.chapter}: {v.title}
                      </option>
                    ))}
                  </select>
                </label>
                <h3>Supporting sources</h3>
                {state.citations.map((c) => (
                  <label key={c.id} className="block">
                    <input
                      type="checkbox"
                      checked={s.sourceIds.includes(c.id)}
                      onChange={(e) =>
                        edit({
                          ...doc,
                          sections: doc.sections.map((v, j) =>
                            i === j
                              ? {
                                  ...v,
                                  sourceIds: e.target.checked
                                    ? [...v.sourceIds, c.id]
                                    : v.sourceIds.filter((x) => x !== c.id),
                                }
                              : v,
                          ),
                        })
                      }
                    />{" "}
                    {c.text}
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="block">
              Revision summary (one point per line)
              <textarea
                className={input}
                value={doc.summary.join("\n")}
                onChange={(e) =>
                  edit({ ...doc, summary: e.target.value.split("\n") })
                }
              />
            </label>
          </div>
        ))}
      <section className={`${paperCard} space-y-4 p-6`}>
        <h2 className="font-serif text-2xl">Share video and notes</h2>
        <p>
          Sharing is {state.sharing.mode}. Only published notes are visible.
          Restricted viewers must sign in with a verified allowed email.
        </p>
        <select
          aria-label="Who can view"
          className={input}
          value={mode}
          onChange={(e) => setMode(e.target.value as ShareMode)}
        >
          <option value="anyone">Anyone with the link</option>
          <option value="restricted">Only selected people</option>
        </select>
        {mode === "restricted" && (
          <label className="block">
            Allowed email addresses (one per line)
            <textarea
              className={input}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
          </label>
        )}
        <button
          disabled={busy || !state.canPublish || dirty}
          className={redButton}
          onClick={() => void action("publish")}
        >
          Publish reviewed lesson
        </button>{" "}
        {state.sharing.publishedAt && (
          <button
            disabled={busy}
            className={quietButton}
            onClick={() => void action("access")}
          >
            Update who can view
          </button>
        )}{" "}
        <button
          disabled={busy || state.sharing.mode === "private"}
          className={quietButton}
          onClick={() => void action("sharing")}
        >
          Turn off sharing
        </button>
        {!state.canPublish && (
          <p>
            Save matching notes and render the current video before publishing.
          </p>
        )}
        {state.sharing.token && state.sharing.mode !== "private" && (
          <p>
            <Link
              className="underline"
              href={`/share/${state.sharing.token}`}
              target="_blank"
            >
              Open shared lesson
            </Link>{" "}
            <button
              className={quietButton}
              onClick={() => {
                navigator.clipboard
                  .writeText(`${location.origin}/share/${state.sharing.token}`)
                  .then(() => setMessage("Link copied."))
                  .catch(() => setError("Could not copy the link."));
              }}
            >
              Copy link
            </button>
          </p>
        )}
      </section>
    </div>
  );
}

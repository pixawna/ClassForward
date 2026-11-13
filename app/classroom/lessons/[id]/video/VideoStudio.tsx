"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { VideoState } from "@/lib/video/state";
import { formatDuration } from "@/lib/lesson-limits";
import { chaptersOf, estimatedSeconds, wordCount, WORDS_PER_MINUTE, type SceneEdit, type ScriptEdit } from "@/lib/video/types";
import { fieldInput, paperCard, quietButton, redButton } from "../../../../components/ui";
import { renderAction, saveScriptAction, writeStoryAction, type VideoActionResult } from "./actions";
import { VideoPlayer } from "./VideoPlayer";

type DraftScene = SceneEdit & { key: string };
type Draft = { title: string; scenes: DraftScene[] };

const POLL_MS = 2500;

let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

function draftFrom(state: VideoState): Draft {
  return {
    title: state.video?.title ?? "",
    scenes: state.scenes.map((s) => ({
      key: s.id,
      id: s.id,
      chapter: s.chapter,
      title: s.title,
      narration: s.narration,
      visual: s.visual,
      objective: s.objective,
    })),
  };
}

const textArea = `${fieldInput} resize-y text-base leading-relaxed`;

export function VideoStudio({
  lessonId,
  topic,
  durationSeconds,
  objectives,
  sourceCount,
  initial,
}: {
  lessonId: string;
  topic: string;
  durationSeconds: number;
  objectives: string[];
  sourceCount: number;
  initial: VideoState;
}) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const video = state.video;
  const busy = video?.status === "writing" || video?.status === "rendering";

  /** Takes a new state from the server; replaces the draft unless the teacher has unsaved edits. */
  function accept(next: VideoState, force = false) {
    setState(next);
    if (force || !dirtyRef.current) {
      setDraft(draftFrom(next));
      setDirty(false);
    }
  }

  // While Claude writes or the video renders, check back every few seconds.
  useEffect(() => {
    if (!busy) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/video`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const next = (await res.json()) as VideoState;
        const finishedWriting = video?.status === "writing" && next.video?.status !== "writing";
        accept(next, finishedWriting);
      } catch {
        // A missed poll is fine; the next one catches up.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [busy, lessonId, video?.status]);

  function act(action: () => Promise<VideoActionResult>, force = false) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        accept(result.state, force || result.ok);
        if (result.message) setMessage({ ok: result.ok, text: result.message });
      } catch {
        setMessage({ ok: false, text: "That didn't work. Check your connection and try again." });
      }
    });
  }

  const script = (): ScriptEdit => ({
    title: draft.title,
    scenes: draft.scenes.map((s) => ({
      id: s.id,
      chapter: s.chapter,
      title: s.title,
      narration: s.narration,
      visual: s.visual,
      objective: s.objective,
    })),
  });

  const write = () => {
    setConfirmRewrite(false);
    act(() => writeStoryAction(lessonId), true);
  };
  const save = () => act(() => saveScriptAction(lessonId, script()));
  const render = () =>
    act(async () => {
      if (dirty) {
        const saved = await saveScriptAction(lessonId, script());
        if (!saved.ok) return saved;
      }
      return renderAction(lessonId);
    }, true);

  // ---- editing ----
  const edit = (change: (scenes: DraftScene[]) => DraftScene[]) => {
    setDraft((d) => ({ ...d, scenes: change(d.scenes) }));
    setDirty(true);
  };
  const updateScene = (key: string, patch: Partial<SceneEdit>) =>
    edit((scenes) => scenes.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const renameChapter = (keys: string[], name: string) =>
    edit((scenes) => scenes.map((s) => (keys.includes(s.key) ? { ...s, chapter: name } : s)));
  const addSceneAfter = (key: string) =>
    edit((scenes) => {
      const i = scenes.findIndex((s) => s.key === key);
      const before = scenes[i];
      const scene: DraftScene = { key: newKey(), chapter: before.chapter, title: "", narration: "", visual: "", objective: before.objective };
      return [...scenes.slice(0, i + 1), scene, ...scenes.slice(i + 1)];
    });
  const removeScene = (key: string) => edit((scenes) => scenes.filter((s) => s.key !== key));
  const addChapter = () =>
    edit((scenes) => [
      ...scenes,
      { key: newKey(), chapter: "New chapter", title: "", narration: "", visual: "", objective: 0 },
    ]);

  const chapters = useMemo(() => chaptersOf(draft.scenes), [draft.scenes]);
  const totalSeconds = draft.scenes.reduce((sum, s) => sum + estimatedSeconds(s.narration), 0);
  const stale = state.hasFile && video && video.renderedVersion !== null && video.renderedVersion < video.scriptVersion;
  const sceneNumbers = new Map(draft.scenes.map((s, i) => [s.key, i + 1]));

  // ---- nothing yet ----
  if (!video || (video.status === "failed" && video.failedStep === "writing" && state.scenes.length === 0)) {
    return (
      <div className="mt-10 max-w-3xl space-y-6">
        <section className={`${paperCard} p-6 sm:p-8`}>
          <h2 className="font-serif text-3xl font-medium tracking-[-0.01em]">Turn this lesson into a story</h2>
          <p className="mt-3 text-lg leading-relaxed text-ink-soft">
            ClassForward writes a story about {topic}: a problem, characters who face it, and the explanation that solves it,
            in named chapters of narrated scenes. Every scene teaches one of your objectives. You review and edit the
            script before anything is drawn or recorded.
          </p>
          <p className="mt-3 text-ink-soft">
            {sourceCount
              ? `ClassForward uses your ${sourceCount} saved source${sourceCount === 1 ? "" : "s"} for the facts.`
              : "Tip: save a few sources on the lesson page first; ClassForward uses them for the facts."}
          </p>
          <button type="button" onClick={write} disabled={pending} className={`${redButton} mt-6`}>
            {pending ? "Starting..." : "Write the story"}
          </button>
          {(message || video?.error) && (
            <p role="alert" className="mt-4 font-hand text-xl text-redpen">
              {message?.text ?? video?.error}
            </p>
          )}
        </section>
      </div>
    );
  }

  // ---- Claude is writing ----
  if (video.status === "writing") {
    return (
      <div className="mt-10 max-w-3xl">
        <WorkingCard
          title="ClassForward is writing the story"
          detail={`Planning the problem, the characters and about ${Math.round((durationSeconds / 60) * WORDS_PER_MINUTE)} words of narration. This takes up to a couple of minutes; you can leave this page.`}
        />
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-10">
      {state.storyOutdated && (
        <p className="rounded-xl border-2 border-dashed border-ink/25 bg-[#FBEFD0]/60 px-4 py-3 text-ink">
          You&apos;ve edited this lesson since the story was written, so the script below follows the old details. Use
          &ldquo;Write a different story&rdquo; to start from your changes, or edit the script yourself.
        </p>
      )}

      {state.hasFile && (
        <div className="space-y-4">
          {stale && (
            <p className="rounded-xl border-2 border-dashed border-ink/25 bg-[#FBEFD0]/60 px-4 py-3 text-ink">
              You&apos;ve changed the script since this video was rendered. Render again to update it.
            </p>
          )}
          <VideoPlayer lessonId={lessonId} version={video.renderedVersion ?? 0} title={video.title ?? topic} chapters={state.chapters} />
        </div>
      )}

      {video.status === "rendering" && (
        <WorkingCard
          title={video.progress?.step ?? "Rendering"}
          detail="ClassForward draws each scene, records the narration, then puts it all together with captions and chapters. Unchanged scenes are reused. You can leave this page; it keeps going."
          progress={video.progress ?? undefined}
        />
      )}

      {video.status === "failed" && video.error && (
        <div role="alert" className="rounded-2xl border-2 border-redpen bg-[#FFF1EE] px-6 py-5">
          <p className="font-semibold text-redpen-deep">
            {video.failedStep === "rendering" ? "The video didn't finish rendering." : "ClassForward couldn't rewrite the story."}
          </p>
          <p className="mt-1 text-ink">{video.error}</p>
        </div>
      )}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        {/* The story */}
        <section aria-labelledby="story-title" className={`${paperCard} p-6 sm:p-7 lg:sticky lg:top-8`}>
          <h2 id="story-title" className="font-hand text-2xl text-redpen">
            The story
          </h2>
          {video.logline && <p className="mt-2 text-lg leading-relaxed text-ink">{video.logline}</p>}
          {video.problem && (
            <>
              <h3 className="mt-5 font-semibold text-ink">The problem</h3>
              <p className="mt-1 leading-relaxed text-ink-soft">{video.problem}</p>
            </>
          )}
          {video.explanation && (
            <>
              <h3 className="mt-5 font-semibold text-ink">What it explains</h3>
              <p className="mt-1 leading-relaxed text-ink-soft">{video.explanation}</p>
            </>
          )}
          {video.characters.length > 0 && (
            <>
              <h3 className="mt-5 font-semibold text-ink">Characters</h3>
              <ul className="mt-2 space-y-2">
                {video.characters.map((c) => (
                  <li key={c.name} className="leading-snug">
                    <span className="font-semibold text-ink">{c.name}</span>
                    <span className="text-ink-soft">, {c.role}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-6 border-t-2 border-dashed border-ink/15 pt-5">
            {confirmRewrite ? (
              <div>
                <p className="text-ink">ClassForward writes a new story and script. Your edits to this one are replaced.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={write} disabled={pending || busy} className={redButton}>
                    Write a new story
                  </button>
                  <button type="button" onClick={() => setConfirmRewrite(false)} className={quietButton}>
                    Keep this one
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRewrite(true)} disabled={pending || busy} className={quietButton}>
                Write a different story
              </button>
            )}
          </div>
        </section>

        {/* The script */}
        <section aria-labelledby="script-title" className="space-y-8">
          <div>
            <h2 id="script-title" className="font-serif text-3xl font-medium tracking-[-0.01em]">
              Script
            </h2>
            <p className="mt-2 text-lg leading-relaxed text-ink-soft">
              Check the facts and the wording before you render. Narration is read exactly as written.
            </p>
            <p className="mt-2 text-ink">
              About <strong>{formatDuration(totalSeconds, "short")}</strong> of narration. The lesson is set to {formatDuration(durationSeconds)}.
            </p>
          </div>

          <div>
            <label htmlFor="video-title" className="block font-semibold text-ink">
              Video title
            </label>
            <input
              id="video-title"
              value={draft.title}
              maxLength={120}
              disabled={busy}
              onChange={(e) => {
                setDraft((d) => ({ ...d, title: e.target.value }));
                setDirty(true);
              }}
              className={`${fieldInput} mt-2`}
            />
          </div>

          {chapters.map((chapter, ci) => {
            const keys = chapter.scenes.map((s) => s.key);
            return (
              <section key={`${ci}-${keys[0]}`} aria-label={`Chapter ${ci + 1}`} className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 font-hand text-2xl text-redpen">Chapter {ci + 1}</span>
                  <label className="sr-only" htmlFor={`chapter-${ci}`}>
                    Chapter {ci + 1} name
                  </label>
                  <input
                    id={`chapter-${ci}`}
                    value={chapter.title}
                    maxLength={80}
                    disabled={busy}
                    onChange={(e) => renameChapter(keys, e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border-2 border-transparent bg-transparent px-2 py-1 font-serif text-2xl font-medium text-ink hover:border-ink/15 focus:border-ink"
                  />
                </div>

                {chapter.scenes.map((scene) => {
                  const n = sceneNumbers.get(scene.key) ?? 0;
                  const words = wordCount(scene.narration);
                  return (
                    <article key={scene.key} aria-label={`Scene ${n}`} className={`${paperCard} p-5 shadow-[0_3px_0_var(--color-ink)] sm:p-6`}>
                      <div className="flex flex-col gap-5 sm:flex-row">
                        <div className="min-w-0 flex-1 space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="shrink-0 font-semibold text-ink-soft">Scene {n}</span>
                            <label className="sr-only" htmlFor={`title-${scene.key}`}>
                              Scene {n} title
                            </label>
                            <input
                              id={`title-${scene.key}`}
                              value={scene.title}
                              maxLength={120}
                              disabled={busy}
                              placeholder="Scene title"
                              onChange={(e) => updateScene(scene.key, { title: e.target.value })}
                              className={`${fieldInput} py-2 text-base font-semibold`}
                            />
                          </div>
                          <div>
                            <label htmlFor={`narration-${scene.key}`} className="block font-semibold text-ink">
                              Narration
                            </label>
                            <textarea
                              id={`narration-${scene.key}`}
                              value={scene.narration}
                              rows={4}
                              maxLength={2000}
                              disabled={busy}
                              onChange={(e) => updateScene(scene.key, { narration: e.target.value })}
                              className={`${textArea} mt-1.5`}
                            />
                            <p className="mt-1 text-sm text-ink-soft">
                              {words} words, about {formatDuration(estimatedSeconds(scene.narration), "short")}
                            </p>
                          </div>
                          <div>
                            <label htmlFor={`visual-${scene.key}`} className="block font-semibold text-ink">
                              On screen
                            </label>
                            <textarea
                              id={`visual-${scene.key}`}
                              value={scene.visual}
                              rows={2}
                              maxLength={1000}
                              disabled={busy}
                              onChange={(e) => updateScene(scene.key, { visual: e.target.value })}
                              className={`${textArea} mt-1.5`}
                            />
                          </div>
                          <div>
                            <label htmlFor={`objective-${scene.key}`} className="block font-semibold text-ink">
                              Teaches
                            </label>
                            <select
                              id={`objective-${scene.key}`}
                              value={scene.objective}
                              disabled={busy}
                              onChange={(e) => updateScene(scene.key, { objective: Number(e.target.value) })}
                              className={`${fieldInput} mt-1.5 py-2 text-base`}
                            >
                              {objectives.map((o, i) => (
                                <option key={i} value={i}>
                                  {i + 1}. {o}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {scene.id && state.scenes.find((s) => s.id === scene.id)?.drawn && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/lessons/${lessonId}/video/scenes/${scene.id}/drawing?v=${video.renderedVersion ?? 0}`}
                            alt={`Drawing for scene ${n}: ${scene.visual}`}
                            className="aspect-video w-full self-start rounded-lg border-2 border-ink/20 bg-paper sm:w-56"
                          />
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-ink/15 pt-4">
                        <button type="button" onClick={() => addSceneAfter(scene.key)} disabled={busy} className={`${quietButton} px-3 py-1 text-sm`}>
                          Add a scene after
                        </button>
                        <button
                          type="button"
                          onClick={() => removeScene(scene.key)}
                          disabled={busy || draft.scenes.length === 1}
                          className={`${quietButton} px-3 py-1 text-sm hover:text-redpen`}
                        >
                          Delete scene
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}

          <button type="button" onClick={addChapter} disabled={busy} className={quietButton}>
            Add a chapter
          </button>
        </section>
      </div>

      {/* Save and render */}
      <div className="sticky bottom-4 z-10">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-[#FFFDF8] px-5 py-4 shadow-[0_5px_0_var(--color-ink)]">
          <button type="button" onClick={render} disabled={pending || busy} className={redButton}>
            {video.status === "rendering" ? "Rendering..." : state.hasFile ? "Render again" : "Render the video"}
          </button>
          <button type="button" onClick={save} disabled={pending || busy || !dirty} className={quietButton}>
            {dirty ? "Save script" : "Saved"}
          </button>
          <p aria-live="polite" className={message && !message.ok ? "font-hand text-xl text-redpen" : "text-ink-soft"}>
            {message?.text ?? (dirty ? "You have unsaved changes." : "")}
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkingCard({ title, detail, progress }: { title: string; detail: string; progress?: { done: number; total: number } }) {
  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <div aria-live="polite" className="rounded-2xl border-2 border-ink bg-board px-6 py-8 text-chalk">
      <p className="font-hand text-2xl">
        {title}
        {progress && progress.total > 1 ? ` (${progress.done} of ${progress.total})` : ""}
        <span className="cf-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
      <p className="mt-2 max-w-[62ch] text-chalk/75">{detail}</p>
      {percent !== null && (
        <div
          className="mt-5 h-3 overflow-hidden rounded-full bg-chalk/20"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={title}
        >
          <div className="h-full rounded-full bg-[#F6D77A] transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

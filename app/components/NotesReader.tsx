"use client";
import { useRef } from "react";
import type { NotesDocument, NoteCitation } from "@/lib/notes/types";
export function NotesReader({
  document,
  timestamps,
  citations,
  videoURL,
  captionsURL,
}: {
  document: NotesDocument;
  timestamps: Record<string, number>;
  citations: NoteCitation[];
  videoURL?: string;
  captionsURL?: string;
}) {
  const player = useRef<HTMLVideoElement>(null);
  return (
    <article className="cf-study-notes space-y-6">
      <div className="no-print">
        <button className="underline" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      {videoURL && (
        <video
          ref={player}
          controls
          preload="metadata"
          className="no-print w-full rounded-xl"
        >
          <source src={videoURL} type="video/mp4" />
          <track
            kind="captions"
            src={captionsURL || `${videoURL}?track=captions`}
            srcLang="en"
            label="English"
            default
          />
        </video>
      )}
      <h1 className="font-serif text-3xl">{document.title}</h1>
      {document.sections.map((s, i) => (
        <section
          key={i}
          className="space-y-3 rounded-xl border border-ink/20 bg-white/70 p-5"
        >
          <h2 className="font-serif text-2xl">{s.title}</h2>
          {timestamps[s.sceneId] !== undefined && videoURL && (
            <button
              className="no-print underline"
              onClick={() => {
                if (player.current) {
                  player.current.currentTime = timestamps[s.sceneId];
                  void player.current.play().catch(() => {});
                }
              }}
            >
              Watch at {Math.floor(timestamps[s.sceneId] / 60)}:
              {String(Math.floor(timestamps[s.sceneId] % 60)).padStart(2, "0")}
            </button>
          )}
          <p className="whitespace-pre-wrap">{s.explanation}</p>
          <ul className="list-disc pl-6">
            {s.keyConcepts.map((v, j) => (
              <li key={j}>{v}</li>
            ))}
          </ul>
          <dl>
            {s.definitions.map((v, j) => (
              <div key={j}>
                <dt className="font-semibold">{v.term}</dt>
                <dd>{v.meaning}</dd>
              </div>
            ))}
          </dl>
          {s.examples.map((v, j) => (
            <p key={j}>
              <strong>Example: </strong>
              {v}
            </p>
          ))}
          {s.formulas.map((v, j) => (
            <p key={j}>
              <code>{v.expression}</code> — {v.meaning}
            </p>
          ))}
          <ul>
            {s.sourceIds.map((id) => {
              const c = citations.find((c) => c.id === id);
              return c ? (
                <li key={id}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >
                    {c.text}
                  </a>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ))}
      <h2 className="font-hand text-2xl">Quick revision</h2>
      <ul className="list-disc pl-6">
        {document.summary.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </article>
  );
}

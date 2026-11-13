"use client";

import { useRef, useState } from "react";
import type { VideoChapter } from "@/lib/video/state";
import { quietButton } from "../../../../components/ui";

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The rendered lesson: video with captions, and a chapter list that jumps to each chapter. */
export function VideoPlayer({
  lessonId,
  version,
  title,
  chapters,
}: {
  lessonId: string;
  version: number;
  title: string;
  chapters: VideoChapter[];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const base = `/api/lessons/${lessonId}/video`;
  const current = chapters.findLastIndex((c) => now >= c.start - 0.05);

  function jump(chapter: VideoChapter) {
    const el = video.current;
    if (!el) return;
    el.currentTime = chapter.start + 0.01;
    void el.play().catch(() => {});
  }

  function toggleCaptions() {
    const track = video.current?.textTracks[0];
    const on = !captionsOn;
    if (track) track.mode = on ? "showing" : "hidden";
    setCaptionsOn(on);
  }

  return (
    <section aria-label="Video" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <div className="overflow-hidden rounded-2xl border-2 border-ink bg-ink shadow-[0_5px_0_var(--color-ink)]">
          {/* Captions come from the narration timings; chapters from the script. */}
          <video
            ref={video}
            key={version}
            controls
            preload="metadata"
            playsInline
            className="aspect-video w-full bg-ink"
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              const track = e.currentTarget.textTracks[0];
              if (track) track.mode = captionsOn ? "showing" : "hidden";
            }}
          >
            <source src={`${base}/file?v=${version}`} type="video/mp4" />
            <track kind="captions" src={`${base}/captions?v=${version}`} srcLang="en" label="English" default />
            <track kind="chapters" src={`${base}/chapters?v=${version}`} srcLang="en" label="Chapters" />
          </video>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={toggleCaptions} aria-pressed={captionsOn} className={quietButton}>
            {captionsOn ? "Captions on" : "Captions off"}
          </button>
          <a href={`${base}/file?download=1&v=${version}`} className={quietButton}>
            Download MP4
          </a>
        </div>
      </div>

      <nav aria-label={`Chapters of ${title}`} className="rounded-2xl border-2 border-ink bg-[#FFFDF8] p-4 shadow-[0_5px_0_var(--color-ink)]">
        <h3 className="px-2 font-hand text-2xl text-redpen">Chapters</h3>
        <ol className="mt-2 space-y-1">
          {chapters.map((c, i) => (
            <li key={`${c.title}-${c.start}`}>
              <button
                type="button"
                onClick={() => jump(c)}
                aria-current={i === current ? "true" : undefined}
                className="flex w-full cursor-pointer items-baseline gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink/5 aria-[current=true]:bg-[#F6D77A]/45"
              >
                <span className="w-11 shrink-0 font-medium text-ink-soft tabular-nums">{clock(c.start)}</span>
                <span className="font-semibold text-ink">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

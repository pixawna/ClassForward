"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ClassroomArt } from "./ClassroomArt";

const RESTING_SPLIT = 52;

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The classroom strip: the old classroom on the left, the ClassForward
 * classroom on the right, and a chalkboard eraser between them that the
 * visitor drags to wipe one into the other.
 */
export function ClassroomScene() {
  const reducedMotion = usePrefersReducedMotion();
  const [split, setSplit] = useState(100);
  const [touched, setTouched] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // On load the eraser sweeps in from the right and wipes half the old lesson away.
  useEffect(() => {
    if (touched) return;
    if (reducedMotion) {
      const id = requestAnimationFrame(() => setSplit(RESTING_SPLIT));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    let start = 0;
    const delay = 1500;
    const duration = 1500;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = (now - start - delay) / duration;
      if (t >= 0) setSplit(100 - (100 - RESTING_SPLIT) * easeInOut(Math.min(1, t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, touched]);

  const moveTo = useCallback((clientX: number) => {
    const box = sceneRef.current?.getBoundingClientRect();
    if (!box) return;
    setSplit(clamp(((clientX - box.left) / box.width) * 100));
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    setTouched(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const stopDragging = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -4, ArrowDown: -4, ArrowRight: 4, ArrowUp: 4 };
    let next: number | null = null;
    if (e.key in steps) next = split + steps[e.key];
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = 100;
    if (next === null) return;
    e.preventDefault();
    setTouched(true);
    setSplit(clamp(next));
  };

  const valueText =
    split > 90
      ? "Showing the old classroom"
      : split < 10
        ? "Showing the ClassForward classroom"
        : `Old classroom on the left, ClassForward classroom on the right`;

  return (
    <div
      ref={sceneRef}
      className="cf-scene relative w-full select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <p className="sr-only">
        An illustrated classroom. On the old side, the teacher points at a board full of notes to copy while
        students sleep, pass notes and yawn. On the ClassForward side, the same board tells the story of a
        raindrop called Drip, a quiz card is pinned up, students raise their hands and share notes.
      </p>

      <div className="cf-era-old absolute inset-0">
        <ClassroomArt era="old" motion={!reducedMotion} idPrefix="old" />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        <ClassroomArt era="new" motion={!reducedMotion} idPrefix="new" />
      </div>

      {/* era labels sit on the floor, either side of the eraser line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[7%] font-hand text-lg sm:text-xl">
        <span
          className="absolute -translate-x-full pr-5 whitespace-nowrap text-ink-soft transition-opacity duration-300"
          style={{ left: `${split}%`, opacity: split > 22 ? 1 : 0 }}
        >
          &larr; the old way
        </span>
        <span
          className="absolute pl-5 whitespace-nowrap text-redpen transition-opacity duration-300"
          style={{ left: `${split}%`, opacity: split < 78 ? 1 : 0 }}
        >
          the ClassForward way &rarr;
        </span>
      </div>

      {/* the eraser */}
      <div className="pointer-events-none absolute top-0 bottom-[19%]" style={{ left: `${split}%` }}>
        <div className="absolute top-[4%] bottom-0 -translate-x-1/2 border-l-[3px] border-dashed border-ink/60" />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Eraser: drag to compare the old classroom with ClassForward"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split)}
          aria-valuetext={valueText}
          onKeyDown={onKeyDown}
          className="cf-eraser pointer-events-auto absolute top-[16%] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[10px] active:cursor-grabbing"
        >
          <svg viewBox="0 0 150 60" className="block h-auto w-[104px] sm:w-[124px]" aria-hidden="true">
            <path d="M14 22 L4 32 L14 42" fill="none" stroke="#D93A2B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={touched ? "opacity-0" : "cf-nudge-l"} />
            <path d="M136 22 L146 32 L136 42" fill="none" stroke="#D93A2B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={touched ? "opacity-0" : "cf-nudge-r"} />
            <rect x="22" y="6" width="106" height="26" rx="8" fill="#C08A52" stroke="#1F2A44" strokeWidth="3" />
            <path d="M34 14 h82 M34 22 h82" stroke="#9A6A3A" strokeWidth="2" strokeLinecap="round" />
            <rect x="22" y="30" width="106" height="24" rx="6" fill="#5D6272" stroke="#1F2A44" strokeWidth="3" />
            <text x="75" y="48" textAnchor="middle" fontSize="17" fill="#EEEBE2" style={{ fontFamily: "var(--font-hand)" }}>
              drag me
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

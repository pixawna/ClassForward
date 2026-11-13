/** Limits shared by the lesson form (browser) and its server-side checks. Lengths are in seconds. */
export const DURATION_MIN = 10;
export const DURATION_MAX = 30 * 60;
export const DURATION_DEFAULT = 15 * 60;

/**
 * The lengths a teacher can pick: 10 to 50 seconds in 10-second steps,
 * a minute and a half, then whole minutes up to 30.
 */
export const DURATION_STEPS: readonly number[] = [
  10, 20, 30, 40, 50, 60, 90,
  ...Array.from({ length: 29 }, (_, i) => (i + 2) * 60),
];

export const isAllowedDuration = (seconds: number) => DURATION_STEPS.includes(seconds);

/** "10 seconds", "1 minute", "1 minute 30 seconds", "15 minutes" ("10 sec", "1 min 30 sec" when short). */
export function formatDuration(seconds: number, style: "long" | "short" = "long") {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  const unit = (n: number, long: string, short: string) =>
    style === "short" ? `${n} ${short}` : `${n} ${long}${n === 1 ? "" : "s"}`;
  const parts = [];
  if (m) parts.push(unit(m, "minute", "min"));
  if (s || !m) parts.push(unit(s, "second", "sec"));
  return parts.join(" ");
}

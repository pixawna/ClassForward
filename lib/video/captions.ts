/*
 * Captions and chapter marks, from the word timings of each scene.
 * Pure functions, so they're easy to test.
 */

export type TimedWord = { text: string; start: number; end: number };

export type Cue = { start: number; end: number; text: string };

const MAX_CHARS = 42; // one comfortable caption line (a sentence end may run to 52)
const MAX_SECONDS = 4;

/** Words to caption cues: short lines that break at sentence ends where possible. */
export function captionCues(words: TimedWord[]): Cue[] {
  const cues: Cue[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (!current.length) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(" "),
    });
    current = [];
  };
  const endsSentence = (w: TimedWord) => /[.!?]["')\]]?$/.test(w.text);
  for (const word of words) {
    const text = [...current, word].map((w) => w.text).join(" ");
    // A sentence's last word may stretch the line a little rather than dangle on its own.
    const limit = endsSentence(word) ? MAX_CHARS + 10 : MAX_CHARS;
    const tooLong = text.length > limit || (current.length > 0 && word.end - current[0].start > MAX_SECONDS + 1);
    if (tooLong) flush();
    current.push(word);
    if (endsSentence(word)) flush();
  }
  flush();
  // Hold each caption until the next one starts (up to a second), so they don't flicker.
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    cues[i].end = next ? Math.min(next.start, cues[i].end + 1) : cues[i].end + 0.5;
  }
  return cues;
}

function stamp(seconds: number, separator: "." | ","): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}`).join("\n\n")}\n`;
}

export function toSrt(cues: Cue[]): string {
  return `${cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}`).join("\n\n")}\n`;
}

export type Chapter = { title: string; start: number; end: number };

/** Chapter marks for the player (WebVTT "chapters" track). */
export function chaptersVtt(chapters: Chapter[]): string {
  return toVtt(chapters.map((c) => ({ start: c.start, end: c.end, text: c.title })));
}

/** Chapter marks embedded in the MP4, in ffmpeg's metadata format. */
export function chaptersFfmetadata(title: string, chapters: Chapter[]): string {
  const esc = (s: string) => s.replace(/([=;#\\\n])/g, "\\$1");
  return `;FFMETADATA1\ntitle=${esc(title)}\n${chapters
    .map((c) => `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${esc(c.title)}`)
    .join("\n")}\n`;
}

/** Reads cues back out of a WebVTT file (for listing chapters next to the player). */
export function parseVtt(vtt: string): Cue[] {
  const seconds = (t: string) => {
    const [h, m, rest] = t.trim().split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(",", "."));
  };
  const cues: Cue[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const timing = lines.findIndex((l) => l.includes("-->"));
    if (timing === -1) continue;
    const [start, end] = lines[timing].split("-->");
    cues.push({ start: seconds(start), end: seconds(end), text: lines.slice(timing + 1).join("\n").trim() });
  }
  return cues;
}

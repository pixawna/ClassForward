import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Lesson } from "./lessons";

/**
 * Finding sources for a lesson with Scrapy (https://www.scrapy.org).
 *
 * The crawler lives in /scraper. Each call runs `python scraper/find_sources.py`,
 * sends one JSON request on stdin and reads one JSON result from stdout:
 *
 * - search: Wikipedia, Simple English Wikipedia and Wikibooks for every lesson,
 *   plus open-access papers from OpenAlex for college lessons (needs a free
 *   OPENALEX_API_KEY). Results are ranked against the lesson's level and objectives.
 * - page: reads one link a teacher pasted (title, site, authors, date) so it
 *   can be cited. Obeys the site's robots.txt.
 */

export type FoundSource = {
  url: string;
  title: string;
  description: string | null;
  /** Who published it: "Wikipedia", a journal name, or the site's name. */
  site: string;
  /** Not shown as a score: results already arrive best match first. */
  relevance: number | null;
  kind: string | null;
  authors: string[];
  /** "2026-11-03", "2026-11" or "2026" */
  published: string | null;
  /** https://doi.org/... for research papers */
  doi: string | null;
  /** Flesch-Kincaid grade of the scraped text: roughly the US school grade that can read it. */
  readingGrade: number | null;
  readingMinutes: number | null;
  /** Section headings scraped from the page. */
  sections: string[];
  /** For sources found in an article's references: which article cited it. */
  citedBy: string | null;
  /** True when Scrapy opened and read the page itself. */
  verified: boolean;
  /** Why the page couldn't be read, when it couldn't. */
  note: string | null;
};

export type SearchNote = { source: string; message: string };

export type SearchStats = { articles_read?: number; references_followed?: number; references_blocked?: number };

export type SearchResult = { results: FoundSource[]; notes: SearchNote[]; stats: SearchStats };

export class ScrapyError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

type RawSource = {
  url: string;
  title: string;
  publisher: string;
  kind: string;
  snippet: string;
  authors: string[];
  published: string | null;
  doi: string | null;
  relevance: number | null;
  reading_grade?: number | null;
  reading_minutes?: number | null;
  sections?: string[] | null;
  cited_by?: string | null;
  verified?: boolean | null;
  note?: string | null;
};

type ScraperRequest =
  | { mode: "search"; topic: string; level: Lesson["level"]; objectives: string[]; limit: number }
  | { mode: "page"; url: string };

// turbopackIgnore: the scraper is run, not bundled. Without it Turbopack tries to
// trace scraper/.venv, whose python is a symlink out of the project, and the build fails.
const SCRAPER_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "scraper");
const SETUP_HINT =
  "Set it up once with: cd scraper && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt (then restart the dev server).";

function pythonCommand() {
  if (process.env.SCRAPER_PYTHON) return process.env.SCRAPER_PYTHON;
  const venvPython =
    process.platform === "win32"
      ? path.join(SCRAPER_DIR, ".venv", "Scripts", "python.exe")
      : path.join(SCRAPER_DIR, ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return process.platform === "win32" ? "python" : "python3";
}

type ScraperOutput = { sources: RawSource[]; problems: SearchNote[]; stats: SearchStats };

function runScraper(request: ScraperRequest, timeoutMs: number): Promise<ScraperOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand(), [path.join(SCRAPER_DIR, "find_sources.py")], {
      cwd: SCRAPER_DIR,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ScrapyError("The source search took too long. Try again in a moment.", 504));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        error.code === "ENOENT"
          ? new ScrapyError(`Python wasn't found, so Scrapy can't run. ${SETUP_HINT}`, 500)
          : error,
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (/No module named '?scrapy/i.test(stderr)) {
        reject(new ScrapyError(`Scrapy isn't installed yet. ${SETUP_HINT}`, 500));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "");
        resolve({ sources: parsed.sources ?? [], problems: parsed.problems ?? [], stats: parsed.stats ?? {} });
      } catch {
        console.error(`[scrapy] exited with ${code}\n${stderr.slice(-3000)}`);
        reject(new ScrapyError("The source search stopped unexpectedly. The server log has the details."));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

const toFound = (s: RawSource): FoundSource => ({
  url: s.url,
  title: s.title,
  description: s.snippet || null,
  site: s.publisher,
  relevance: s.relevance,
  kind: s.kind || null,
  authors: s.authors ?? [],
  published: s.published,
  doi: s.doi,
  readingGrade: s.reading_grade ?? null,
  readingMinutes: s.reading_minutes ?? null,
  sections: s.sections ?? [],
  citedBy: s.cited_by ?? null,
  verified: Boolean(s.verified),
  note: s.note ?? null,
});

/** Wikis search best on the plain topic name, so that's the starting query. */
export function defaultQuery(lesson: Lesson) {
  return lesson.topic;
}

/**
 * Search, then read the top articles, then follow the sources they cite.
 * Usually 5 to 20 seconds; Scrapy itself stops crawling at 45.
 */
export async function findSources(lesson: Lesson, query: string): Promise<SearchResult> {
  const { sources, problems, stats } = await runScraper(
    { mode: "search", topic: query, level: lesson.level, objectives: lesson.objectives, limit: 12 },
    75_000,
  );
  return { results: sources.map(toFound), notes: problems, stats };
}

/**
 * Reads one page's citation details. When the site can't be read (it blocks
 * crawlers, say), the source still comes back, built from the link itself,
 * with verified: false and the reason in `note`.
 */
export async function readLink(url: string): Promise<{ source: FoundSource | null; note: string | null }> {
  const { sources, problems } = await runScraper({ mode: "page", url }, 30_000);
  return { source: sources[0] ? toFound(sources[0]) : null, note: problems[0]?.message ?? null };
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { apaCitation } from "@/lib/citations";
import type { Level, SavedSource } from "@/lib/lessons";
import type { FoundSource, SearchNote, SearchResult, SearchStats } from "@/lib/scrapy";
import { paperCard, quietButton, redButton } from "../../../components/ui";
import { addLinkAction, removeSourceAction, saveSourceAction } from "../actions";

type Phase =
  | { kind: "idle" }
  | { kind: "searching"; startedAt: number }
  | { kind: "done"; results: FoundSource[]; notes: SearchNote[]; stats: SearchStats }
  | { kind: "error"; message: string };

const SEARCHED: Record<Level, string> = {
  high_school: "Simple English Wikipedia, Wikipedia and Wikibooks",
  college: "Wikipedia, Wikibooks and open-access research on OpenAlex",
};

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

const byCitation = (a: SavedSource, b: SavedSource) => apaCitation(a).localeCompare(apaCitation(b));

/** The citation text with its link made clickable. */
function CitationText({ source }: { source: SavedSource }) {
  const text = apaCitation(source);
  const link = source.doi || source.url;
  const at = text.lastIndexOf(link);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="[overflow-wrap:anywhere] text-ink-soft underline decoration-ink/25 underline-offset-2 hover:decoration-redpen"
      >
        {link}
      </a>
      {text.slice(at + link.length)}
    </>
  );
}

/** What Scrapy learned by reading the page: reading level, length, what it covers, who cited it. */
function ScrapedDetails({ source }: { source: FoundSource }) {
  const grade = source.readingGrade;
  return (
    <div className="mt-3 space-y-2 text-sm">
      {(grade !== null || source.readingMinutes) && (
        <p className="flex flex-wrap gap-2">
          {grade !== null && (
            <span className="rounded-full bg-[#9CCDEB]/35 px-2.5 py-0.5 font-medium text-ink">
              Reading level: {grade < 13 ? `grade ${Math.round(grade)}` : grade < 17 ? "college" : "advanced"}
            </span>
          )}
          {source.readingMinutes && (
            <span className="rounded-full bg-[#F6D77A]/45 px-2.5 py-0.5 font-medium text-ink">
              {source.readingMinutes} min read
            </span>
          )}
        </p>
      )}
      {source.sections.length > 0 && (
        <p className="text-ink-soft">
          <span className="font-semibold text-ink">Covers:</span> {source.sections.slice(0, 5).join(", ")}
        </p>
      )}
      {source.citedBy && (
        <p className="text-ink-soft">
          <span className="font-semibold text-ink">Cited by</span> {source.citedBy}
        </p>
      )}
      {!source.verified && source.note && <p className="font-hand text-lg leading-snug text-redpen">{source.note}</p>}
    </div>
  );
}

function SourceMeta({ site, kind, published, authors }: Pick<FoundSource, "site" | "kind" | "published" | "authors">) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-soft">
      <span className="font-semibold text-ink">{site}</span>
      {kind && <span>{kind}</span>}
      {published && <span>{published.slice(0, 4)}</span>}
      {authors.length > 0 && (
        <span>
          {authors.slice(0, 2).join(", ")}
          {authors.length > 2 ? " and others" : ""}
        </span>
      )}
    </p>
  );
}

export function SourceFinder({
  lessonId,
  level,
  defaultQuery,
  initialSaved,
  searchOnOpen,
}: {
  lessonId: string;
  level: Level;
  defaultQuery: string;
  initialSaved: SavedSource[];
  searchOnOpen: boolean;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [saved, setSaved] = useState(initialSaved);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [linkMessage, setLinkMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingLink, startAddingLink] = useTransition();
  const [, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const runId = useRef(0);
  const opened = useRef(false);
  const activeSearch = useRef<AbortController | null>(null);

  // Strict Mode replays setup/cleanup in development. Allow that setup to
  // restart the automatic search, and cancel work that belongs to the old mount.
  useEffect(() => () => {
    runId.current += 1;
    activeSearch.current?.abort();
    activeSearch.current = null;
    opened.current = false;
  }, []);

  useEffect(() => {
    if (phase.kind !== "searching") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - phase.startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const run = ++runId.current;
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    // Bound the browser request as well as the server-side crawler. This also
    // covers a stalled response body or a request that never reaches the route.
    const timeout = setTimeout(() => controller.abort(), 85_000);
    setElapsed(0);
    setPhase({ kind: "searching", startedAt: Date.now() });
    try {
      const result = await readJson<SearchResult>(
        await fetch(`/api/lessons/${lessonId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        }),
      );
      if (run === runId.current) {
        setPhase({ kind: "done", results: result.results, notes: result.notes, stats: result.stats ?? {} });
      }
    } catch (err) {
      if (run === runId.current) {
        setPhase({
          kind: "error",
          message: controller.signal.aborted
            ? "The source search took too long. Please try again."
            : err instanceof Error ? err.message : "Something went wrong.",
        });
      }
    } finally {
      clearTimeout(timeout);
      if (activeSearch.current === controller) activeSearch.current = null;
    }
  }

  // A brand-new lesson starts looking for sources straight away.
  useEffect(() => {
    if (searchOnOpen && !opened.current) {
      opened.current = true;
      void search();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOnOpen]);

  function save(result: FoundSource) {
    setBusyUrl(result.url);
    setActionError(null);
    startTransition(async () => {
      try {
        setSaved(
          await saveSourceAction(lessonId, {
            url: result.url,
            title: result.title,
            description: result.description,
            relevance: result.relevance,
            foundVia: "scrapy",
            site: result.site,
            kind: result.kind,
            authors: result.authors,
            published: result.published,
            doi: result.doi,
          }),
        );
      } catch {
        setActionError("That source couldn't be saved. Try again.");
      } finally {
        setBusyUrl(null);
      }
    });
  }

  function remove(source: SavedSource) {
    setBusyUrl(source.url);
    setActionError(null);
    startTransition(async () => {
      try {
        setSaved(await removeSourceAction(lessonId, source.id));
      } catch {
        setActionError("That source couldn't be removed. Try again.");
      } finally {
        setBusyUrl(null);
      }
    });
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkMessage(null);
    startAddingLink(async () => {
      try {
        const result = await addLinkAction(lessonId, link);
        setSaved(result.saved);
        setLinkMessage({ ok: result.ok, text: result.message });
        if (result.ok) setLink("");
      } catch {
        setLinkMessage({ ok: false, text: "That link couldn't be added. Try again." });
      }
    });
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setActionError("Copying didn't work in this browser. Select the citation text instead.");
    }
  }

  const savedUrls = new Set(saved.map((s) => s.url));
  const citations = [...saved].sort(byCitation);

  return (
    <section aria-labelledby="sources-title" className="space-y-8">
      <div>
        <h2 id="sources-title" className="font-serif text-3xl font-medium tracking-[-0.01em]">
          Sources
        </h2>
        <p className="mt-2 max-w-[56ch] text-lg leading-relaxed text-ink-soft">
          Scrapy searches {SEARCHED[level]}, reads the top articles, then follows the sources they cite, like
          government agencies and universities. Sources that fit your level and objectives come first. Save the ones
          you&apos;ll teach from.
        </p>
      </div>

      {/* Saved citations */}
      <div className={`${paperCard} p-6 sm:p-7`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-hand text-2xl text-redpen">Saved for citations ({saved.length})</h3>
          {saved.length > 1 && (
            <button
              type="button"
              onClick={() => copy("all", citations.map(apaCitation).join("\n\n"))}
              className={quietButton}
            >
              {copied === "all" ? "Copied" : "Copy all"}
            </button>
          )}
        </div>
        {saved.length === 0 ? (
          <p className="mt-3 text-ink-soft">Nothing saved yet. Find sources below and save the ones you want to cite.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-soft">APA 7th edition, in alphabetical order. Check each one before you share it.</p>
            <ul className="mt-4 space-y-4">
              {citations.map((s) => (
                <li key={s.id} className="border-t border-dashed border-ink/15 pt-4 first:border-0 first:pt-0">
                  <p className="pl-6 -indent-6 leading-relaxed break-words text-ink">
                    <CitationText source={s} />
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 pl-6">
                    <button type="button" onClick={() => copy(s.id, apaCitation(s))} className={`${quietButton} px-3 py-1 text-sm`}>
                      {copied === s.id ? "Copied" : "Copy citation"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      disabled={busyUrl === s.url}
                      className={`${quietButton} px-3 py-1 text-sm hover:text-redpen`}
                    >
                      Remove
                    </button>
                    {s.foundVia === "link" && <span className="self-center font-hand text-lg text-redpen">your link</span>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {actionError && (
          <p role="alert" className="mt-4 font-hand text-xl text-redpen">
            {actionError}
          </p>
        )}

        {/* The teacher's own link */}
        <form onSubmit={addLink} className="mt-6 border-t-2 border-dashed border-ink/15 pt-5">
          <label htmlFor="own-link" className="block font-semibold text-ink">
            Add your own link
          </label>
          <p id="own-link-hint" className="text-ink-soft">
            Scrapy opens the page and reads its title, author and date for the citation.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="own-link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              maxLength={2000}
              aria-describedby={linkMessage ? "own-link-hint own-link-status" : "own-link-hint"}
              className="min-w-0 flex-1 rounded-full border-2 border-ink/20 bg-white px-5 py-2.5 text-ink focus:border-ink"
            />
            <button type="submit" disabled={addingLink || !link.trim()} className={`${quietButton} border-ink`}>
              {addingLink ? "Reading page..." : "Add link"}
            </button>
          </div>
          <p
            id="own-link-status"
            aria-live="polite"
            className={linkMessage && !linkMessage.ok ? "mt-2 font-hand text-xl text-redpen" : "mt-2 text-ink-soft"}
          >
            {linkMessage?.text}
          </p>
        </form>
      </div>

      {/* Search */}
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="source-query" className="sr-only">
          Search for sources about
        </label>
        <input
          id="source-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={300}
          className="min-w-0 flex-1 rounded-full border-2 border-ink/20 bg-white px-5 py-3 text-lg text-ink focus:border-ink"
        />
        <button type="submit" disabled={phase.kind === "searching" || !query.trim()} className={redButton}>
          {phase.kind === "searching" ? "Searching..." : phase.kind === "done" ? "Search again" : "Find sources"}
        </button>
      </form>

      <div aria-live="polite">
        {phase.kind === "searching" && (
          <div className="rounded-2xl border-2 border-ink bg-board px-6 py-8 text-chalk">
            <p className="font-hand text-2xl">
              Scrapy is searching {SEARCHED[level]}
              <span className="cf-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
            <p className="mt-2 text-chalk/75">
              Reading the top articles and following the sources they cite, then ranking everything against your
              objectives. This usually takes 5 to 20 seconds.
              {elapsed > 0 && ` (${elapsed}s)`}
            </p>
          </div>
        )}

        {phase.kind === "error" && (
          <div role="alert" className="rounded-2xl border-2 border-redpen bg-[#FFF1EE] px-6 py-5">
            <p className="font-semibold text-redpen-deep">The search didn&apos;t work.</p>
            <p className="mt-1 text-ink">{phase.message}</p>
          </div>
        )}

        {phase.kind === "done" && (
          <div>
            <p className="text-ink-soft">
              {phase.results.length === 0
                ? "No sources matched. Try a broader or more common name for the topic."
                : `${phase.results.length} sources, best match first. Scrapy read ${phase.stats.articles_read ?? 0} ${
                    phase.stats.articles_read === 1 ? "article" : "articles"
                  } and opened ${phase.stats.references_followed ?? 0} of the sources they cite.`}
            </p>
            {phase.notes.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                {phase.notes.map((n, i) => (
                  <li key={i}>
                    <span className="font-semibold text-ink">{n.source}:</span> {n.message}
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-4 space-y-4">
              {phase.results.map((r) => {
                const savedRow = saved.find((s) => s.url === r.url);
                return (
                  <li key={r.url} className={`${paperCard} flex flex-col gap-4 p-5 shadow-[0_3px_0_var(--color-ink)] sm:flex-row sm:items-start`}>
                    <div className="min-w-0 flex-1">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-serif text-xl leading-snug font-medium text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-redpen"
                      >
                        {r.title}
                      </a>
                      <SourceMeta site={r.site} kind={r.kind} published={r.published} authors={r.authors} />
                      {r.description && <p className="mt-2 line-clamp-3 leading-relaxed text-ink">{r.description}</p>}
                      <ScrapedDetails source={r} />
                    </div>
                    {savedUrls.has(r.url) && savedRow ? (
                      <button
                        type="button"
                        onClick={() => remove(savedRow)}
                        disabled={busyUrl === r.url}
                        aria-label={`Saved. Remove ${r.title} from citations`}
                        className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-full border-2 border-[#4E9F6E] bg-[#DFF3EA] px-4 py-2 font-semibold whitespace-nowrap text-[#2F6E48]"
                      >
                        &#10003; Saved
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => save(r)}
                        disabled={busyUrl === r.url}
                        className={`${quietButton} shrink-0 self-start border-ink`}
                      >
                        {busyUrl === r.url ? "Saving..." : "Save for citations"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

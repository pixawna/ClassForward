"""
Two spiders.

LessonSourcesSpider finds sources for a lesson in three crawl steps:

  1. Search: Wikipedia, Simple English Wikipedia and Wikibooks (and OpenAlex
     research papers for college lessons, with a key) for the topic.
  2. Read the articles: crawl the top article pages themselves and scrape their
     prose, section headings, length and reading level.
  3. Follow the references: from the articles that are about the topic, follow
     the sources they cite (government agencies, universities, educational
     publishers) and scrape those pages too. A site that refuses crawlers is
     still listed, with the citation details Wikipedia gives for it.

PageCitationSpider reads one link a teacher pasted, for its citation details.

Everything obeys robots.txt except the two search APIs (Wikimedia's api.php
and api.openalex.org), which exist for programs to call. Requests identify
ClassForward with a contact address, as Wikimedia's User-Agent policy asks.
Sites that block crawlers are respected, not worked around.
"""

from __future__ import annotations

import os
import re
from datetime import date
from urllib.parse import urlencode

import scrapy
from scrapy.http import TextResponse

from .pages import (
    clean_text,
    host_of,
    organization_for,
    page_citation,
    reading_grade,
    reading_minutes,
    slug_title,
    wiki_body,
    wiki_references,
)
from .relevance import normalize_topic, terms

WIKIS = {
    "wikipedia": {"base": "https://en.wikipedia.org", "publisher": "Wikipedia", "kind": "Encyclopedia article"},
    "simplewiki": {
        "base": "https://simple.wikipedia.org",
        "publisher": "Simple English Wikipedia",
        "kind": "Encyclopedia article (simple English)",
    },
    "wikibooks": {"base": "https://en.wikibooks.org", "publisher": "Wikibooks", "kind": "Open textbook"},
}

LEVEL_SOURCES = {
    "high_school": ["simplewiki", "wikipedia", "wikibooks"],
    "college": ["wikipedia", "wikibooks", "openalex"],
}

OPENALEX_WORKS = "https://api.openalex.org/works"
SNIPPET_CHARS = 400
ARTICLES_PER_WIKI = 2  # article pages crawled from each wiki's search results
REFERENCES_PER_ARTICLE = 8  # cited sources followed from one article
MAX_REFERENCES = 10  # cited sources followed in total
# Search APIs and article pages get a longer wait and one retry; cited sites get one short try.
IMPORTANT = {"download_timeout": 12, "max_retry_times": 1}
FILE_LINK = re.compile(r"\.(pdf|xlsx?|docx?|pptx?|zip|csv)(\?|$)", re.I)


def today() -> str:
    return date.today().isoformat()


def wiki_search_url(base: str, query: str, limit: int) -> str:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "0",
        "gsrlimit": str(limit),
        "prop": "extracts|info|revisions",
        "exintro": "1",
        "explaintext": "1",
        "exsentences": "3",
        "exlimit": "max",
        "inprop": "url",
        "rvprop": "timestamp",
        "redirects": "1",
        "maxlag": "5",
    }
    return f"{base}/w/api.php?{urlencode(params)}"


def openalex_search_url(query: str, api_key: str, limit: int) -> str:
    params = {
        "search": query,
        "filter": "is_oa:true,has_abstract:true,type:article|review",
        "per_page": str(limit),
        "select": "id,doi,display_name,publication_year,authorships,primary_location,open_access,abstract_inverted_index,type",
        "api_key": api_key,
    }
    return f"{OPENALEX_WORKS}?{urlencode(params)}"


def abstract_from_inverted_index(index: dict | None) -> str:
    if not index:
        return ""
    positions = {}
    for word, spots in index.items():
        for spot in spots:
            positions[spot] = word
    return " ".join(positions[i] for i in sorted(positions))


def failure_reason(failure) -> str:
    reason = failure.value.__class__.__name__
    if reason == "IgnoreRequest":
        return "its robots.txt doesn't allow crawlers"
    if reason == "HttpError":
        status = getattr(getattr(failure.value, "response", None), "status", "?")
        if status in (401, 403, 429):
            return f"it blocks automated readers (it answered {status})"
        return f"it answered with an error ({status})"
    if "Timeout" in reason:
        return "it took too long to answer"
    if any(word in reason for word in ("DNS", "ConnectionRefused", "ConnectError", "Tunnel", "NoRoute", "ConnectionLost")):
        return "it couldn't be reached"
    return f"the request failed ({reason})"


class ProblemsMixin:
    """Collects human-readable problems so the app can show them instead of a stack trace."""

    def note_problem(self, source: str, message: str) -> None:
        self.problems.append({"source": source, "message": message})

    def on_error(self, failure):
        request = failure.request
        source = request.meta.get("source_name", host_of(request.url))
        self.note_problem(source, f"Skipped because {failure_reason(failure)}.")


class LessonSourcesSpider(ProblemsMixin, scrapy.Spider):
    name = "lesson_sources"

    def __init__(self, topic: str = "", level: str = "high_school", objectives=None, per_source: int = 5, **kwargs):
        super().__init__(**kwargs)
        self.topic = (topic or "").strip()
        self.level = level if level in LEVEL_SOURCES else "high_school"
        self.objectives = list(objectives or [])
        self.per_source = int(per_source)
        self.problems: list[dict] = []
        self.openalex_key = os.environ.get("OPENALEX_API_KEY", "").strip()
        self.topic_terms = terms(normalize_topic(self.topic))
        self.wanted_terms = self.topic_terms | terms(" ".join(self.objectives))
        self.followed: set[str] = set()
        self.stats = {"articles_read": 0, "references_followed": 0, "references_blocked": 0}

    # ---- step 1: search ----

    async def start(self):
        if not self.topic:
            self.note_problem("ClassForward", "No topic was given.")
            return
        for key in LEVEL_SOURCES[self.level]:
            if key == "openalex":
                if not self.openalex_key:
                    self.note_problem(
                        "OpenAlex",
                        "Research papers are off. Add a free OPENALEX_API_KEY to .env.local to include them.",
                    )
                    continue
                yield scrapy.Request(
                    openalex_search_url(self.topic, self.openalex_key, self.per_source + 1),
                    callback=self.parse_openalex,
                    errback=self.on_error,
                    meta={"dont_obey_robotstxt": True, "source_name": "OpenAlex", **IMPORTANT},
                )
                continue
            wiki = WIKIS[key]
            yield scrapy.Request(
                wiki_search_url(wiki["base"], self.topic, self.per_source),
                callback=self.parse_wiki,
                errback=self.on_error,
                cb_kwargs={"wiki_key": key},
                meta={"dont_obey_robotstxt": True, "source_name": wiki["publisher"], **IMPORTANT},
            )

    def parse_wiki(self, response, wiki_key: str):
        wiki = WIKIS[wiki_key]
        data = response.json()
        if "error" in data:
            self.note_problem(wiki["publisher"], data["error"].get("info", "The search API returned an error."))
            return
        pages = sorted(data.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99))
        crawled = 0
        for page in pages:
            if page.get("missing") or page.get("ns", 0) != 0:
                continue
            extract = clean_text(page.get("extract", ""), SNIPPET_CHARS)
            if not extract or "may refer to" in extract[:300] or "(disambiguation)" in page.get("title", ""):
                continue  # empty or a disambiguation page
            revisions = page.get("revisions") or [{}]
            item = {
                "url": page.get("canonicalurl") or page.get("fullurl"),
                "title": page.get("title", ""),
                "publisher": wiki["publisher"],
                "kind": wiki["kind"],
                "snippet": extract,
                "authors": [],
                "published": (revisions[0].get("timestamp") or "")[:10] or None,
                "doi": None,
                "accessed": today(),
                "source_key": wiki_key,
                "search_rank": page.get("index", 9),
                "verified": False,
            }
            if crawled < ARTICLES_PER_WIKI:
                crawled += 1
                # Step 2: read the article page itself.
                yield scrapy.Request(
                    item["url"],
                    callback=self.parse_article,
                    errback=self.article_failed,
                    cb_kwargs={"item": item},
                    meta={"source_name": wiki["publisher"], **IMPORTANT},
                )
            else:
                yield item

    def parse_openalex(self, response):
        data = response.json()
        for rank, work in enumerate(data.get("results", []), start=1):
            location = work.get("primary_location") or {}
            source = location.get("source") or {}
            open_access = work.get("open_access") or {}
            url = open_access.get("oa_url") or work.get("doi") or location.get("landing_page_url") or work.get("id")
            if not url or not work.get("display_name"):
                continue
            authors = [
                a["author"]["display_name"]
                for a in (work.get("authorships") or [])
                if a.get("author", {}).get("display_name")
            ]
            yield {
                "url": url,
                "title": clean_text(work["display_name"], 300),
                "publisher": source.get("display_name") or "OpenAlex",
                "kind": "Review article" if work.get("type") == "review" else "Research article",
                "snippet": clean_text(abstract_from_inverted_index(work.get("abstract_inverted_index")), SNIPPET_CHARS),
                "authors": authors[:8],
                "published": str(work["publication_year"]) if work.get("publication_year") else None,
                "doi": work.get("doi"),
                "accessed": today(),
                "source_key": "openalex",
                "search_rank": rank,
                "verified": True,
            }

    # ---- step 2: read the article ----

    def is_about_topic(self, title: str) -> bool:
        """True for the article on the topic itself, not one that only mentions it."""
        title_terms = terms(normalize_topic(title.split("/")[-1]))
        return bool(self.topic_terms) and self.topic_terms <= title_terms and len(title_terms - self.topic_terms) <= 1

    def parse_article(self, response, item: dict):
        text, sections = wiki_body(response)
        words = len(text.split())
        item.update(
            {
                "verified": True,
                "reading_grade": reading_grade(text),
                "reading_minutes": reading_minutes(words),
                "sections": sections,
                "_text": text[:20000],
            }
        )
        self.stats["articles_read"] += 1
        yield item

        if not self.is_about_topic(item["title"]):
            return
        # Step 3: follow the sources this article cites.
        candidates = wiki_references(response)
        # High school: government, university and educational sites only. College: journals too.
        min_trust = 2.0 if self.level == "high_school" else 1.0
        candidates = [c for c in candidates if c["trust"] >= min_trust]
        for c in candidates:
            hits = len(self.wanted_terms & terms(c["title"]))
            c["score"] = c.pop("trust") * 2 + hits * 1.5
        candidates.sort(key=lambda c: c["score"], reverse=True)
        followed_here = 0
        for ref in candidates:
            if followed_here >= REFERENCES_PER_ARTICLE or len(self.followed) >= MAX_REFERENCES:
                break
            if ref["url"] in self.followed:
                continue
            self.followed.add(ref["url"])
            followed_here += 1
            ref.pop("score")
            if FILE_LINK.search(ref["url"]):
                # A PDF or spreadsheet: list it with Wikipedia's details rather than download it.
                ref.pop("archive_url", None)
                ref.update({"accessed": today(), "source_key": "reference", "search_rank": 3,
                            "cited_by": f'{item["publisher"]}: {item["title"]}', "verified": False})
                yield ref
                continue
            ref.update(
                {
                    "accessed": today(),
                    "source_key": "reference",
                    "search_rank": 3,
                    "cited_by": f'{item["publisher"]}: {item["title"]}',
                    "verified": False,
                }
            )
            yield scrapy.Request(
                ref["url"],
                callback=self.parse_reference,
                errback=self.reference_failed,
                cb_kwargs={"ref": ref},
                meta={"source_name": ref["publisher"], "download_timeout": 6, "dont_retry": True},
            )

    def article_failed(self, failure):
        item = failure.request.cb_kwargs["item"]
        self.note_problem(item["publisher"], f'Couldn\'t read "{item["title"]}" because {failure_reason(failure)}.')
        yield item  # the search result is still worth showing

    # ---- step 3: the cited sources ----

    def parse_reference(self, response, ref: dict):
        ref.pop("archive_url", None)
        if not isinstance(response, TextResponse) or b"html" not in (response.headers.get("Content-Type") or b"text/html"):
            ref["verified"] = True  # a PDF or file that loaded fine: keep Wikipedia's details
            self.stats["references_followed"] += 1
            yield ref
            return
        details = page_citation(response)
        self.stats["references_followed"] += 1
        yield {
            **ref,
            **{k: v for k, v in details.items() if v},
            # Wikipedia's citation is often more exact about title, authors and date.
            "title": ref["title"] if len(ref["title"]) > 8 else details["title"],
            "authors": ref["authors"] or details["authors"],
            "published": ref["published"] or details["published"],
            "verified": True,
        }

    def reference_failed(self, failure):
        ref = failure.request.cb_kwargs["ref"]
        status = getattr(getattr(failure.value, "response", None), "status", None)
        archived = ref.pop("archive_url", None)
        if status in (404, 410):
            self.stats["references_dead"] = self.stats.get("references_dead", 0) + 1
            if not archived:
                return  # a dead link with no saved copy isn't worth a teacher's time
            ref["url"] = archived
            ref["note"] = "The original page is gone, so this links to the Internet Archive's saved copy."
            yield ref
            return
        self.stats["references_blocked"] += 1
        ref["note"] = f"Couldn't open the page itself because {failure_reason(failure)}. Details come from Wikipedia's citation."
        yield ref


class PageCitationSpider(ProblemsMixin, scrapy.Spider):
    name = "page_citation"

    def __init__(self, url: str = "", **kwargs):
        super().__init__(**kwargs)
        self.url = url
        self.problems: list[dict] = []

    async def start(self):
        yield scrapy.Request(
            self.url,
            callback=self.parse_page,
            errback=self.page_failed,
            meta={"source_name": "Your link", "download_timeout": 10, "max_retry_times": 1},
        )

    def fallback(self, url: str) -> dict:
        return {
            "url": url,
            "title": slug_title(url),
            "publisher": organization_for(url) or host_of(url),
            "kind": "Web page",
            "snippet": "",
            "authors": [],
            "published": None,
            "doi": None,
            "accessed": today(),
            "source_key": "page",
            "search_rank": 1,
            "verified": False,
        }

    def parse_page(self, response):
        if not isinstance(response, TextResponse) or b"html" not in (response.headers.get("Content-Type") or b"text/html"):
            self.note_problem("Your link", "That link isn't a web page, so its details couldn't be read.")
            yield self.fallback(response.url)
            return
        details = page_citation(response)
        if host_of(response.url).endswith(("wikipedia.org", "wikibooks.org")):
            text, sections = wiki_body(response)
            details.update(
                {
                    "kind": "Encyclopedia article" if "wikipedia" in response.url else "Open textbook",
                    "reading_grade": reading_grade(text),
                    "reading_minutes": reading_minutes(len(text.split())),
                    "sections": sections,
                }
            )
        yield {**details, "accessed": today(), "source_key": "page", "search_rank": 1, "verified": True}

    def page_failed(self, failure):
        host = host_of(failure.request.url)
        self.note_problem("Your link", f"{host} couldn't be read because {failure_reason(failure)}")
        yield self.fallback(failure.request.url)


def strip_internal(item: dict) -> dict:
    return {k: v for k, v in item.items() if not k.startswith("_")}


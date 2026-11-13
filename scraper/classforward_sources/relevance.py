"""Rank candidate sources against what the teacher wants to teach."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from .pages import source_trust

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "their", "they", "them",
    "how", "what", "why", "when", "where", "which", "who", "will", "can", "able", "should", "would",
    "students", "student", "learn", "learning", "understand", "explain", "describe", "identify",
    "know", "knows", "use", "using", "between", "each", "other", "are", "is", "was", "were", "been",
    "its", "it's", "of", "to", "in", "on", "a", "an", "be", "by", "or", "as", "at", "not", "but",
    "also", "more", "most", "some", "such", "than", "then", "there", "these", "those", "one", "two",
}

# Which publishers suit which level. Simple English Wikipedia reads well for teenagers;
# peer-reviewed papers are mostly useful at college level.
LEVEL_BONUS = {
    "high_school": {"simplewiki": 2.0, "wikibooks": 0.5, "wikipedia": 1.0, "openalex": -2.0, "reference": 1.0, "page": 0.0},
    "college": {"simplewiki": -1.5, "wikibooks": 0.5, "wikipedia": 1.0, "openalex": 1.5, "reference": 1.0, "page": 0.0},
}

MAX_PER_PUBLISHER = 4


def normalize_topic(text: str) -> str:
    """ "The water cycle" -> "water cycle", so it matches the article titled "Water cycle"."""
    return re.sub(r"^(the|a|an)\s+", "", (text or "").strip().lower())


def terms(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9][a-z0-9'-]+", (text or "").lower())
    out = set()
    for w in words:
        if len(w) < 3 or w in STOPWORDS:
            continue
        if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.add(w)
    return out


def _normal_url(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.netloc.lower().removeprefix('www.')}{parts.path.rstrip('/')}"


def level_fit(grade: float | None, level: str) -> float:
    """Reading level (US grade) against the class: plain prose suits high school."""
    if grade is None:
        return 0.0
    if level == "high_school":
        if grade <= 10:
            return 1.5
        if grade <= 12:
            return 0.75
        if grade <= 14:
            return 0.0
        return -1.0
    return 0.5 if grade >= 11 else 0.0


def rank(items: list[dict], topic: str, objectives: list[str], level: str, limit: int = 12) -> list[dict]:
    wanted = normalize_topic(topic)
    topic_terms = terms(wanted)
    objective_terms = terms(" ".join(objectives)) - topic_terms
    bonus = LEVEL_BONUS.get(level, {})

    scored, seen = [], set()
    for item in items:
        key = _normal_url(item["url"])
        if key in seen:
            continue
        seen.add(key)

        title = item.get("title", "")
        title_terms = terms(title)
        summary_terms = terms(item.get("snippet", ""))
        body_terms = terms(item.get("_text", "")[:20000]) | summary_terms
        cited_by_topic_article = bool(item.get("cited_by"))
        if topic_terms and not (topic_terms & (title_terms | body_terms)) and not cited_by_topic_article:
            continue  # doesn't mention the topic at all

        score = len(topic_terms & title_terms) * 3 + len(topic_terms & (summary_terms - title_terms)) * 1.0
        # How much of what the teacher wants covered the source actually talks about.
        if objective_terms:
            score += 3.0 * len(objective_terms & body_terms) / len(objective_terms)
        score += bonus.get(item.get("source_key", "page"), 0.0)
        score += level_fit(item.get("reading_grade"), level)
        if item.get("source_key") == "reference":
            score += source_trust(item["url"]) * 0.5
        if item.get("verified"):
            score += 0.5
        score += 1.0 / (1 + item.get("search_rank", 9))
        title_l = normalize_topic(title.split("/")[-1])
        if wanted and wanted in title_l:
            score += 2
            if wanted == title_l:
                score += 3  # the article about exactly this topic
        scored.append((round(score, 2), item))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    picked, per_publisher = [], {}
    for score, item in scored:
        publisher = item.get("publisher", "")
        if per_publisher.get(publisher, 0) >= MAX_PER_PUBLISHER:
            continue
        per_publisher[publisher] = per_publisher.get(publisher, 0) + 1
        picked.append({**item, "relevance": score})
        if len(picked) >= limit:
            break
    return picked

"""
Reading real web pages: main text, reading level, sections, citation details.
Shared by the lesson search spider and the "add your own link" spider.
"""

from __future__ import annotations

import html
import re
from urllib.parse import unquote, urlsplit

# Organizations teachers cite often, for pages that don't name themselves.
HOST_NAMES = {
    "usgs.gov": "U.S. Geological Survey",
    "noaa.gov": "National Oceanic and Atmospheric Administration",
    "nasa.gov": "NASA",
    "epa.gov": "U.S. Environmental Protection Agency",
    "nih.gov": "National Institutes of Health",
    "cdc.gov": "Centers for Disease Control and Prevention",
    "nps.gov": "National Park Service",
    "loc.gov": "Library of Congress",
    "archives.gov": "National Archives",
    "si.edu": "Smithsonian Institution",
    "nationalgeographic.org": "National Geographic Society",
    "nationalgeographic.com": "National Geographic",
    "bbc.co.uk": "BBC",
    "britannica.com": "Encyclopaedia Britannica",
    "ck12.org": "CK-12 Foundation",
    "khanacademy.org": "Khan Academy",
    "openstax.org": "OpenStax",
    "libretexts.org": "LibreTexts",
    "smithsonianmag.com": "Smithsonian Magazine",
    "ipcc.ch": "Intergovernmental Panel on Climate Change",
    "nsidc.org": "National Snow and Ice Data Center",
    "wikipedia.org": "Wikipedia",
    "wikibooks.org": "Wikibooks",
}

# Parts of a MediaWiki page that aren't the article's own prose. Matched as whole
# class names: a loose contains() also hits the skin's wrappers ("vector-...thumb...").
_SKIP_CLASSES = ("reflist", "references", "navbox", "infobox", "hatnote", "sidebar", "thumb", "gallery", "mw-references-wrap")
WIKI_SKIP = " or ".join(f"contains(concat(' ', normalize-space(@class), ' '), ' {c} ')" for c in _SKIP_CLASSES) + " or self::figure"
WIKI_PARAGRAPHS = f".//p[not(ancestor::table) and not(ancestor::*[{WIKI_SKIP}])]"
WIKI_META_SECTIONS = {
    "see also", "references", "notes", "external links", "further reading", "bibliography",
    "sources", "citations", "related pages", "footnotes", "other websites",
}


def clean_text(text: str, limit: int | None = None) -> str:
    text = re.sub(r"<[^>]+>", "", html.unescape(text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    if limit is None or len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "..."


def host_of(url: str) -> str:
    return urlsplit(url).netloc.lower().split(":")[0].removeprefix("www.")


def organization_for(url: str) -> str | None:
    host = host_of(url)
    for suffix, name in HOST_NAMES.items():
        if host == suffix or host.endswith("." + suffix):
            return name
    return None


def slug_title(url: str) -> str:
    """A readable title from a link alone: .../freshwater/water-cycle -> "Water cycle"."""
    parts = [unquote(p) for p in urlsplit(url).path.split("/") if p]
    for part in reversed(parts):
        part = re.sub(r"\.(html?|php|aspx?|pdf)$", "", part, flags=re.I)
        if re.fullmatch(r"[0-9a-f-]{6,}|\d+|index|default", part, flags=re.I):
            continue
        words = re.sub(r"[-_+]+", " ", part).strip()
        if words:
            return words[0].upper() + words[1:]
    return host_of(url)


def node_text(selector) -> str:
    """Visible text of one element, without footnote markers or inline CSS."""
    return clean_text("".join(selector.xpath(".//text()[not(ancestor::sup) and not(ancestor::style) and not(ancestor::script)]").getall()))


def _syllables(word: str) -> int:
    word = word.lower()
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(1, count)


def reading_grade(text: str) -> float | None:
    """Flesch-Kincaid grade level: roughly the US school grade that can read the text."""
    sample = " ".join(text.split()[:1500])
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", sample)
    sentences = max(1, len(re.findall(r"[.!?](\s|$)", sample)))
    if len(words) < 60:
        return None
    syllables = sum(_syllables(w) for w in words)
    grade = 0.39 * (len(words) / sentences) + 11.8 * (syllables / len(words)) - 15.59
    return round(max(1.0, min(grade, 20.0)), 1)


def reading_minutes(word_count: int) -> int | None:
    return max(1, round(word_count / 200)) if word_count else None


def wiki_body(response) -> tuple[str, list[str]]:
    """Article prose and its section headings from a MediaWiki page."""
    content = response.css("#mw-content-text .mw-parser-output")
    paragraphs = [node_text(p) for p in content.xpath(WIKI_PARAGRAPHS)]
    text = "\n".join(p for p in paragraphs if len(p) > 40)
    sections = []
    for heading in content.xpath(".//h2"):
        name = clean_text(heading.xpath("string()").get() or "").removesuffix("[edit]").strip()
        if name and name.lower() not in WIKI_META_SECTIONS:
            sections.append(name)
    return text, sections[:10]


def page_body(response) -> str:
    """Main prose of an ordinary web page."""
    for scope in ("main", "article", "body"):
        paragraphs = [node_text(p) for p in response.css(f"{scope} p")]
        paragraphs = [p for p in paragraphs if len(p) > 60]
        if paragraphs:
            return "\n".join(paragraphs)
    return ""


def first(response, *selectors: str) -> str | None:
    for selector in selectors:
        value = response.css(selector).get()
        if value and value.strip():
            return value.strip()
    return None


MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], start=1)}


def normal_date(value: str | None) -> str | None:
    """Turns most date spellings into "YYYY-MM-DD", "YYYY-MM" or "YYYY"."""
    if not value:
        return None
    value = value.strip()
    match = re.search(r"(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?", value)
    if match:
        year, month, day = match.groups()
        return f"{year}-{int(month):02d}" + (f"-{int(day):02d}" if day else "")
    match = re.search(r"(\d{1,2})?\s*([A-Za-z]+)\.?\s+(\d{1,2})?,?\s*(\d{4})", value)
    if match and match.group(2).lower() in MONTHS:
        day = match.group(1) or match.group(3)
        month = MONTHS[match.group(2).lower()]
        return f"{match.group(4)}-{month:02d}" + (f"-{int(day):02d}" if day else "")
    match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", value)
    return match.group(1) if match else None


def tidy_title(title: str, publisher: str | None) -> str:
    """Drops a trailing " | Site name" when it just repeats the publisher."""
    for sep in (" | ", " - ", " – ", " — "):
        if sep in title:
            head, tail = title.rsplit(sep, 1)
            tail_l = tail.strip().lower()
            if publisher and (tail_l == publisher.lower() or tail_l in publisher.lower() or publisher.lower() in tail_l):
                return head.strip()
            if tail_l in ("wikipedia", "wikibooks", "simple english wikipedia"):
                return head.strip()
    return title


def page_citation(response) -> dict:
    """Title, publisher, authors, date and summary of an ordinary web page."""
    org = organization_for(response.url)
    publisher = (
        first(response, 'meta[property="og:site_name"]::attr(content)', 'meta[name="citation_journal_title"]::attr(content)')
        or org
        or host_of(response.url)
    )
    if org and len(publisher) <= 6 and publisher.isupper():
        publisher = org  # "USGS" -> "U.S. Geological Survey"
    title = first(
        response,
        'meta[name="citation_title"]::attr(content)',
        'meta[property="og:title"]::attr(content)',
        "title::text",
        "h1::text",
    )
    authors = [a.strip() for a in response.css('meta[name="citation_author"]::attr(content)').getall() if a.strip()]
    if not authors:
        single = first(response, 'meta[name="author"]::attr(content)', 'meta[property="article:author"]::attr(content)')
        if single and not single.startswith("http") and single.lower() not in publisher.lower():
            authors = [single]
    published = normal_date(
        first(
            response,
            'meta[name="citation_publication_date"]::attr(content)',
            'meta[name="citation_date"]::attr(content)',
            'meta[property="article:published_time"]::attr(content)',
            'meta[property="article:modified_time"]::attr(content)',
            'meta[name="dc.date"]::attr(content)',
            'meta[name="DC.date"]::attr(content)',
            "time::attr(datetime)",
        )
    )
    body = page_body(response)
    summary = first(response, 'meta[property="og:description"]::attr(content)', 'meta[name="description"]::attr(content)')
    if not summary and body:
        summary = body.split("\n", 1)[0]
    words = len(body.split())
    return {
        "url": response.url,
        "title": clean_text(tidy_title(title or slug_title(response.url), publisher), 300),
        "publisher": clean_text(publisher, 200),
        "kind": "Web page",
        "snippet": clean_text(summary or "", 400),
        "authors": authors[:8],
        "published": published,
        "doi": first(response, 'meta[name="citation_doi"]::attr(content)'),
        "reading_grade": reading_grade(body),
        "reading_minutes": reading_minutes(words),
        # Headings on ordinary sites are mostly menus ("News", "Missions"), so only wikis report sections.
        "sections": [],
        "_text": body[:20000],
    }


# ---------- Wikipedia's reference list ----------

SKIP_HOSTS = (
    "web.archive.org", "archive.org", "worldcat.org", "books.google.", "google.com", "semanticscholar.org",
    "scixplorer.org", "jstor.org", "wikipedia.org", "wikimedia.org", "wikidata.org", "wiktionary.org",
    "youtube.com", "facebook.com", "twitter.com", "x.com", "amazon.", "ui.adsabs.harvard.edu", "hdl.handle.net",
    "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov/pmc", "api.semanticscholar.org", "s2cid", "linkinghub.elsevier.com",
)
EDU_HOSTS = (
    "bbc.co.uk", "nationalgeographic.org", "nationalgeographic.com", "britannica.com", "khanacademy.org",
    "openstax.org", "libretexts.org", "ck12.org", "smithsonianmag.com", "si.edu", "pbs.org", "pbslearningmedia.org",
)


def source_trust(url: str) -> float:
    """How much a teacher can lean on a site, roughly: government, university, educational publisher."""
    host = host_of(url)
    if re.search(r"\.(gov|mil)(\.[a-z]{2})?$|\.gov\.|\.gc\.ca$", host):
        return 3.0
    if re.search(r"\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$", host):
        return 2.5
    if any(host == h or host.endswith("." + h) for h in EDU_HOSTS):
        return 2.5
    if host.endswith(".int") or host in ("ipcc.ch", "who.int", "un.org", "unesco.org"):
        return 2.0
    if host.endswith(".org"):
        return 1.0
    return 0.0


def wiki_references(response) -> list[dict]:
    """Sources an article cites, with the details Wikipedia already gives for each one."""
    out, seen = [], set()
    for cite in response.css("ol.references > li cite.citation"):
        all_links = [h for h in cite.css("a.external::attr(href)").getall() if h.startswith("http")]
        archive_url = next((h for h in all_links if "web.archive.org/web/" in h), None)
        links = [h for h in all_links if not any(skip in h for skip in SKIP_HOSTS)]
        if not links:
            continue
        url = links[0].split("#:~:text=")[0]
        if url in seen or re.search(r"\.(png|jpe?g|gif|svg)$|/media/images/", url, flags=re.I):
            continue
        seen.add(url)
        text = node_text(cite)
        title = clean_text(cite.css("a.external::text").get() or "").strip('"“”')
        if not title or len(title) < 4:
            continue
        website = clean_text(cite.css("i::text").get() or "")
        authors_match = re.match(r"^([^\"“(]{3,120}?)\s\((\d{4}[^)]*|[A-Z][a-z]+ \d{1,2}, \d{4}|\d{1,2} [A-Z][a-z]+ \d{4})\)", text)
        authors = []
        if authors_match and "," in authors_match.group(1):
            authors = [a.strip() for a in re.split(r";|\s&\s|\band\b", authors_match.group(1)) if a.strip()][:6]
        date_match = re.search(r"\(([^)]*\d{4}[^)]*)\)", text)
        published = normal_date(date_match.group(1)) if date_match else None
        is_doi = "doi.org/" in url
        org = organization_for(url)
        out.append(
            {
                "url": url,
                "title": clean_text(tidy_title(title, website or org), 300),
                "publisher": org or (website if website and not website.startswith("www.") else None) or host_of(url),
                "kind": "Research article" if is_doi else "Web page",
                "snippet": "",
                "authors": authors,
                "published": published,
                "doi": url if is_doi else None,
                "trust": 1.5 if is_doi else source_trust(url),
                "archive_url": archive_url,
            }
        )
    return out

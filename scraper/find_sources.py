#!/usr/bin/env python3
"""
Find educational sources for a ClassForward lesson with Scrapy.

Reads one JSON request on stdin and prints one JSON result on stdout.
Scrapy's logs go to stderr.

    {"mode": "search", "topic": "Photosynthesis", "level": "high_school",
     "objectives": ["Explain where plants get their energy"], "limit": 10}

    {"mode": "page", "url": "https://example.org/article"}

Result:

    {"sources": [{"url", "title", "publisher", "kind", "snippet", "authors",
                  "published", "doi", "accessed", "relevance"}, ...],
     "problems": [{"source", "message"}, ...]}

Try it by hand:

    echo '{"mode":"search","topic":"Photosynthesis","level":"high_school"}' | python find_sources.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scrapy import signals  # noqa: E402
from scrapy.crawler import CrawlerProcess  # noqa: E402

from classforward_sources.relevance import rank  # noqa: E402
from classforward_sources.settings import crawler_settings  # noqa: E402
from classforward_sources.spiders import LessonSourcesSpider, PageCitationSpider  # noqa: E402

PUBLIC_FIELDS = (
    "url", "title", "publisher", "kind", "snippet", "authors", "published", "doi", "accessed", "relevance",
    "reading_grade", "reading_minutes", "sections", "cited_by", "verified", "note",
)


def run(request: dict) -> dict:
    mode = request.get("mode", "search")
    if mode == "page":
        spider_cls, kwargs = PageCitationSpider, {"url": request["url"]}
    else:
        spider_cls = LessonSourcesSpider
        kwargs = {
            "topic": request.get("topic", ""),
            "level": request.get("level", "high_school"),
            "objectives": request.get("objectives", []),
        }

    items: list[dict] = []
    process = CrawlerProcess(settings=crawler_settings(mode))
    crawler = process.create_crawler(spider_cls)

    def collect(item, response, spider):
        items.append(dict(item))

    # A named function, not a lambda: Scrapy's signals hold weak references.
    crawler.signals.connect(collect, signal=signals.item_scraped)
    process.crawl(crawler, **kwargs)
    process.start()

    spider = crawler.spider
    problems = list(getattr(spider, "problems", []))
    if mode == "page":
        sources = items[:1]
        for s in sources:
            s["relevance"] = None
    else:
        sources = rank(
            items,
            topic=kwargs["topic"],
            objectives=kwargs["objectives"],
            level=kwargs["level"],
            limit=int(request.get("limit", 12)),
        )
    return {
        "sources": [{k: s.get(k) for k in PUBLIC_FIELDS} for s in sources],
        "problems": problems,
        "stats": getattr(spider, "stats", {}),
    }


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"sources": [], "problems": [{"source": "ClassForward", "message": f"Bad request: {exc}"}]}))
        return 2
    print(json.dumps(run(request)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

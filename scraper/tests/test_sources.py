"""
Offline tests for the source finder. No network needed.

    cd scraper && .venv/bin/python -m unittest discover -s tests -v

fixtures/live/ holds real pages (Wikipedia, USGS) saved for parser tests;
the rest are small hand-made files in the formats the real sites return.
"""

import http.server
import json
import os
import subprocess
import sys
import threading
import time
import unittest

from scrapy.http import HtmlResponse, Request, TextResponse

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")
sys.path.insert(0, os.path.dirname(HERE))

from classforward_sources.pages import (  # noqa: E402
    normal_date,
    page_citation,
    reading_grade,
    slug_title,
    source_trust,
    wiki_body,
    wiki_references,
)
from classforward_sources.relevance import normalize_topic, rank, terms  # noqa: E402
from classforward_sources.spiders import (  # noqa: E402
    LessonSourcesSpider,
    PageCitationSpider,
    abstract_from_inverted_index,
)


def fixture(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as f:
        return f.read()


def json_response(url: str, name: str) -> TextResponse:
    return TextResponse(url=url, body=fixture(name), encoding="utf-8", headers={"Content-Type": "application/json"})


def html_response(url: str, name: str) -> HtmlResponse:
    return HtmlResponse(
        url=url, body=fixture(name), encoding="utf-8",
        headers={"Content-Type": "text/html; charset=utf-8"}, request=Request(url),
    )


class RealPageTests(unittest.TestCase):
    """Parsers against pages saved from the real sites."""

    def test_wikipedia_article_body(self):
        response = html_response("https://en.wikipedia.org/wiki/Water_cycle", "live/wiki_water_cycle.html")
        text, sections = wiki_body(response)
        self.assertGreater(len(text.split()), 1500)
        self.assertIn("Description", sections)
        self.assertNotIn("References", sections)
        self.assertNotIn("[", text[:200])  # footnote markers stripped
        grade = reading_grade(text)
        self.assertTrue(grade and 9 <= grade <= 20, grade)

    def test_simple_english_reads_easier(self):
        full = reading_grade(wiki_body(html_response("https://en.wikipedia.org/wiki/Water_cycle", "live/wiki_water_cycle.html"))[0])
        simple = reading_grade(wiki_body(html_response("https://simple.wikipedia.org/wiki/Water_cycle", "live/simplewiki_water_cycle.html"))[0])
        self.assertLess(simple, full)

    def test_wikipedia_references(self):
        refs = wiki_references(html_response("https://en.wikipedia.org/wiki/Water_cycle", "live/wiki_water_cycle.html"))
        hosts = {r["url"].split("/")[2] for r in refs}
        self.assertIn("www.usgs.gov", hosts)
        self.assertTrue(any(r["archive_url"] for r in refs))
        self.assertIn("science.nasa.gov", hosts)
        self.assertNotIn("web.archive.org", hosts)
        nasa = next(r for r in refs if "science.nasa.gov" in r["url"])
        self.assertEqual(nasa["publisher"], "NASA")
        self.assertTrue(nasa["title"].startswith("Water Cycle"))
        self.assertGreaterEqual(source_trust(nasa["url"]), 3)

    def test_usgs_page_citation(self):
        details = page_citation(html_response("https://www.usgs.gov/water-science-school/water-cycle", "live/usgs_water_cycle.html"))
        self.assertEqual(details["title"], "Water cycle")
        self.assertEqual(details["publisher"], "U.S. Geological Survey")
        self.assertTrue(details["snippet"].startswith("The water cycle describes"))
        self.assertIsNotNone(details["reading_grade"])
        self.assertGreater(details["reading_minutes"], 1)


class ParseTests(unittest.TestCase):
    def setUp(self):
        self.spider = LessonSourcesSpider(topic="Photosynthesis", level="high_school", objectives=["Explain how chlorophyll captures light"])

    def test_search_results_lead_to_article_pages(self):
        out = list(self.spider.parse_wiki(json_response("https://en.wikipedia.org/w/api.php", "wikipedia_search.json"), "wikipedia"))
        requests = [o for o in out if isinstance(o, Request)]
        items = [o for o in out if isinstance(o, dict)]
        self.assertEqual([r.url for r in requests], ["https://en.wikipedia.org/wiki/Photosynthesis", "https://en.wikipedia.org/wiki/Chlorophyll"])
        self.assertEqual([i["title"] for i in items], ["Calvin cycle", "Leaf"])  # disambiguation page skipped

    def test_article_page_is_scraped_and_references_followed(self):
        item = {"url": "https://en.wikipedia.org/wiki/Photosynthesis", "title": "Photosynthesis", "publisher": "Wikipedia"}
        out = list(self.spider.parse_article(html_response(item["url"], "e2e_article.html"), item=item))
        scraped = out[0]
        self.assertTrue(scraped["verified"])
        self.assertEqual(scraped["sections"], ["Light reactions", "Calvin cycle"])
        self.assertIsNotNone(scraped["reading_grade"])
        followed = [o.url for o in out[1:] if isinstance(o, Request)]
        self.assertIn("https://www.usgs.gov/photosynthesis-guide", followed)
        self.assertNotIn("https://web.archive.org/web/2020/https://example.com/x", followed)

    def test_article_not_about_topic_follows_nothing(self):
        item = {"url": "https://en.wikipedia.org/wiki/Leaf", "title": "Leaf", "publisher": "Wikipedia"}
        out = list(self.spider.parse_article(html_response(item["url"], "e2e_article.html"), item=item))
        self.assertEqual(len(out), 1)

    def test_openalex_results(self):
        items = list(self.spider.parse_openalex(json_response("https://api.openalex.org/works", "openalex_search.json")))
        review, article = items
        self.assertEqual(review["url"], "https://journal.example/photo1.pdf")
        self.assertEqual(review["kind"], "Review article")
        self.assertEqual(review["snippet"], "Photosynthesis converts light into chemical energy.")
        self.assertEqual(article["publisher"], "OpenAlex")

    def test_page_metadata(self):
        spider = PageCitationSpider(url="https://plantlab.example/leaves")
        (item,) = list(spider.parse_page(html_response("https://plantlab.example/leaves", "article.html")))
        self.assertEqual(item["title"], "How leaves make food")
        self.assertEqual(item["publisher"], "Plant Lab")
        self.assertEqual(item["authors"], ["Dr. Maya Chen"])
        self.assertEqual(item["published"], "2025-03-14")

    def test_helpers(self):
        self.assertEqual(abstract_from_inverted_index({"b": [1], "a": [0]}), "a b")
        self.assertEqual(normal_date("Published 2024/7/4"), "2024-07-04")
        self.assertEqual(normal_date("March 5, 2019"), "2019-03-05")
        self.assertEqual(normal_date("5 March 2019"), "2019-03-05")
        self.assertEqual(normal_date("2019"), "2019")
        self.assertIsNone(normal_date("yesterday"))
        self.assertEqual(slug_title("https://www.noaa.gov/education/resource-collections/freshwater/water-cycle"), "Water cycle")
        self.assertEqual(normalize_topic("The water cycle"), "water cycle")
        self.assertIn("leaf", terms("Leaves and leafs"))


class RankTests(unittest.TestCase):
    def items(self, level):
        spider = LessonSourcesSpider(topic="Photosynthesis", level=level)
        out = []
        for name, key, url in [
            ("wikipedia_search.json", "wikipedia", "https://en.wikipedia.org/w/api.php"),
            ("simplewiki_search.json", "simplewiki", "https://simple.wikipedia.org/w/api.php"),
            ("wikibooks_search.json", "wikibooks", "https://en.wikibooks.org/w/api.php"),
        ]:
            # Treat every search result as listed (whether or not its page would be crawled).
            for o in spider.parse_wiki(json_response(url, name), key):
                out.append(o if isinstance(o, dict) else o.cb_kwargs["item"])
        out += list(spider.parse_openalex(json_response("https://api.openalex.org/works", "openalex_search.json")))
        return out

    def test_exact_topic_article_first(self):
        ranked = rank(self.items("high_school"), "Photosynthesis", ["Explain how chlorophyll captures light"], "high_school")
        self.assertEqual(normalize_topic(ranked[0]["title"].split("/")[-1]), "photosynthesis")
        self.assertNotIn("Cookbook:Bread", [r["title"] for r in ranked])

    def test_leading_article_in_topic_is_ignored(self):
        items = [
            {"url": "https://x/a", "title": "Effects of climate change on the water cycle", "snippet": "water cycle", "source_key": "wikipedia", "search_rank": 1},
            {"url": "https://x/b", "title": "Water cycle", "snippet": "The water cycle", "source_key": "wikipedia", "search_rank": 3},
        ]
        self.assertEqual(rank(items, "The water cycle", [], "high_school")[0]["title"], "Water cycle")

    def test_college_lifts_papers(self):
        paper = "Improving photosynthesis efficiency in crops"
        hs = [r["title"] for r in rank(self.items("high_school"), "Photosynthesis", [], "high_school")]
        college = [r["title"] for r in rank(self.items("college"), "Photosynthesis", [], "college")]
        self.assertLess(college.index(paper), hs.index(paper) if paper in hs else 99)

    def test_reading_level_fits_high_school(self):
        easy = {"url": "https://x/easy", "title": "Photosynthesis", "snippet": "", "source_key": "page", "reading_grade": 8}
        hard = {"url": "https://x/hard", "title": "Photosynthesis", "snippet": "", "source_key": "page", "reading_grade": 17}
        self.assertEqual(rank([hard, easy], "Photosynthesis", [], "high_school")[0]["url"], "https://x/easy")


class FakeSitesHandler(http.server.BaseHTTPRequestHandler):
    """A stand-in for Wikipedia, OpenAlex and the sites articles cite."""

    routes = {
        "/robots.txt": ("robots.txt", "text/plain"),
        "/wikipedia/w/api.php": ("wikipedia_search.json", "application/json"),
        "/simplewiki/w/api.php": ("simplewiki_search.json", "application/json"),
        "/wikibooks/w/api.php": ("wikibooks_search.json", "application/json"),
        "/openalex/works": ("openalex_search.json", "application/json"),
        "/article.html": ("article.html", "text/html; charset=utf-8"),
        "/private/secret.html": ("article.html", "text/html; charset=utf-8"),
        "/usgs/photosynthesis-guide": ("article.html", "text/html; charset=utf-8"),
        "/noaa/blocked/plants-and-light": ("article.html", "text/html; charset=utf-8"),
    }

    def body_for(self, name: str) -> bytes:
        base = f"http://{self.headers['Host']}"
        text = fixture(name).decode("utf-8")
        for real, fake in [
            ("https://en.wikipedia.org", f"{base}/wikipedia"),
            ("https://simple.wikipedia.org", f"{base}/simplewiki"),
            ("https://en.wikibooks.org", f"{base}/wikibooks"),
            ("https://www.usgs.gov", f"{base}/usgs"),
            ("https://www.noaa.gov", f"{base}/noaa"),
            ("https://www.ck12.org", f"{base}/ck12"),
        ]:
            text = text.replace(real, fake)
        return text.encode("utf-8")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/usgs/slow/"):
            time.sleep(30)  # a cited site that never answers in time
            return
        if "/wiki/" in path:
            route = ("e2e_article.html", "text/html; charset=utf-8")
        elif path.startswith("/ck12/"):
            self.send_response(403)
            self.end_headers()
            return
        else:
            route = self.routes.get(path)
        if not route:
            self.send_response(404)
            self.end_headers()
            return
        body = self.body_for(route[0])
        self.send_response(200)
        self.send_header("Content-Type", route[1])
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class EndToEndTests(unittest.TestCase):
    """Runs the real Scrapy crawl (in a subprocess, as the app does) against the fake sites."""

    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeSitesHandler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def run_finder(self, request, env=None):
        result = subprocess.run(
            [sys.executable, os.path.join(HERE, "_run_patched.py"), self.base, json.dumps(request)],
            capture_output=True, text=True, timeout=120, env={**os.environ, **(env or {})},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_search_crawls_articles_and_cited_sources(self):
        started = time.monotonic()
        out = self.run_finder({"mode": "search", "topic": "Photosynthesis", "level": "high_school", "objectives": ["Explain how chlorophyll captures light"], "limit": 40})
        by_url = {s["url"].replace(self.base, ""): s for s in out["sources"]}
        article = by_url["/wikipedia/wiki/Photosynthesis"]
        self.assertTrue(article["verified"])
        self.assertEqual(article["sections"], ["Light reactions", "Calvin cycle"])
        self.assertIsNotNone(article["reading_grade"])

        cited = by_url["/usgs/photosynthesis-guide"]  # crawled: page details, Wikipedia's title
        self.assertTrue(cited["verified"])
        self.assertEqual(cited["title"], "Photosynthesis and plant energy")
        self.assertTrue(cited["cited_by"].endswith("Wikipedia: Photosynthesis"), cited["cited_by"])

        blocked = by_url["/noaa/blocked/plants-and-light"]  # robots.txt says no: kept from Wikipedia's citation
        self.assertFalse(blocked["verified"])
        self.assertEqual(blocked["authors"], ["Rivera, Ana"])
        self.assertEqual(blocked["published"], "2021-04-02")
        self.assertIn("robots.txt", blocked["note"])

        forbidden = by_url["/ck12/forbidden/photosynthesis"]  # answered 403
        self.assertIn("blocks automated readers", forbidden["note"])

        # A dead cited page links to its archived copy; one with no copy is dropped.
        archived = next(s for s in out["sources"] if s["title"] == "Photosynthesis poster")
        self.assertTrue(archived["url"].startswith("https://web.archive.org/"))
        self.assertNotIn("Photosynthesis lost page", [s["title"] for s in out["sources"]])

        # A site that never answers costs one short try, not the whole search.
        self.assertLess(time.monotonic() - started, 20)
        slow = next(s for s in out["sources"] if "never answers" in s["title"])
        self.assertIn("took too long", slow["note"])
        # Files listed from Wikipedia's citation, not downloaded.
        pdf = next(s for s in out["sources"] if s["title"] == "Photosynthesis data tables")
        self.assertFalse(pdf["verified"])
        self.assertGreater(out["stats"]["articles_read"], 0)

    def test_search_college_without_key_explains(self):
        out = self.run_finder(
            {"mode": "search", "topic": "Photosynthesis", "level": "college", "objectives": []},
            env={"OPENALEX_API_KEY": ""},
        )
        self.assertTrue(any(p["source"] == "OpenAlex" for p in out["problems"]))

    def test_search_college_with_key(self):
        out = self.run_finder(
            {"mode": "search", "topic": "Photosynthesis", "level": "college", "objectives": []},
            env={"OPENALEX_API_KEY": "test-key"},
        )
        self.assertIn("Journal of Plant Science", [s["publisher"] for s in out["sources"]])

    def test_page_mode_reads_metadata(self):
        out = self.run_finder({"mode": "page", "url": f"{self.base}/article.html"})
        self.assertEqual(out["sources"][0]["title"], "How leaves make food")
        self.assertTrue(out["sources"][0]["verified"])

    def test_page_mode_obeys_robots_but_keeps_the_link(self):
        out = self.run_finder({"mode": "page", "url": f"{self.base}/private/secret.html"})
        self.assertFalse(out["sources"][0]["verified"])
        self.assertEqual(out["sources"][0]["title"], "Secret")
        self.assertIn("robots.txt", out["problems"][0]["message"])


if __name__ == "__main__":
    unittest.main()

import os

DEFAULT_CONTACT = "https://github.com/pixawna/ClassForward"

# A teacher is waiting, so the crawl works to a deadline. Whatever has been
# read when it runs out is still returned.
DEADLINE_SECONDS = {"search": 25, "page": 15}


def crawler_settings(mode: str = "search") -> dict:
    """Polite and quick: obey robots.txt, identify ourselves, give slow sites one short try."""
    contact = os.environ.get("SCRAPER_CONTACT", DEFAULT_CONTACT)
    return {
        "BOT_NAME": "classforward",
        # Wikimedia and most sites ask bots for a descriptive User-Agent with a way to reach you.
        "USER_AGENT": os.environ.get("SCRAPER_USER_AGENT")
        or f"ClassForwardBot/0.1 (+{contact}; finds sources for teachers' lessons)",
        "ROBOTSTXT_OBEY": True,
        "CONCURRENT_REQUESTS": 16,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
        "DOWNLOAD_DELAY": 0.25,
        # Applies to robots.txt checks too. Search APIs and articles ask for longer per request.
        "DOWNLOAD_TIMEOUT": 6,
        "DOWNLOAD_MAXSIZE": 5 * 1024 * 1024,
        # No retries by default (a dead site would cost double); the requests that matter opt in.
        "RETRY_TIMES": 0,
        "REDIRECT_MAX_TIMES": 5,
        "COOKIES_ENABLED": False,
        "CLOSESPIDER_TIMEOUT": DEADLINE_SECONDS.get(mode, 25),
        "TELNETCONSOLE_ENABLED": False,
        "LOG_LEVEL": os.environ.get("SCRAPY_LOG_LEVEL", "WARNING"),
    }

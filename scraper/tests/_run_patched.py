"""Runs find_sources.run() with every remote site pointed at a local test server."""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from classforward_sources import pages, spiders  # noqa: E402

base = sys.argv[1]
for key in spiders.WIKIS:
    spiders.WIKIS[key]["base"] = f"{base}/{key}"
spiders.OPENALEX_WORKS = f"{base}/openalex/works"
# The fake site is 127.0.0.1, so treat its cited pages as trusted ones.
pages.source_trust = lambda url: 3.0

import find_sources  # noqa: E402

print(json.dumps(find_sources.run(json.loads(sys.argv[2]))))

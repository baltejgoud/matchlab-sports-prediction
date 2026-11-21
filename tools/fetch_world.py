"""World Pulse network worker: markets, AI news, model releases and sports headlines.

Run as a short-lived process so the dashboard server can keep its offline guard:
    python tools/fetch_world.py <markets|news|models|sports>
Prints one JSON object. Every source is read on its own, so one failing feed
only removes its own items and is reported in "sources".
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from matchlab import world  # noqa: E402

TIMEOUT = 8
USER_AGENT = "Mozilla/5.0 (compatible; MatchLab/1.0)"
TICKERS = (("ANT", "Anthropic"), ("NVDA", "NVIDIA"), ("GOOGL", "Alphabet"), ("AMZN", "Amazon"), ("MSFT", "Microsoft"))
CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=5d&interval=30m"
GOOGLE_NEWS = "https://news.google.com/rss/search?q={}&hl=en-US&gl=US&ceid=US:en"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/{}/news?limit=15"

NEWS_FEEDS = (
    ("OpenAI", "https://openai.com/news/rss.xml", "feed"),
    ("Google DeepMind", "https://deepmind.google/blog/rss.xml", "feed"),
    ("Hugging Face", "https://huggingface.co/blog/feed.xml", "feed"),
    ("TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/", "feed"),
    ("The Verge", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "feed"),
    ("Anthropic coverage", GOOGLE_NEWS.format(quote("Anthropic OR Claude when:7d")), "feed"),
    ("AI model launches", GOOGLE_NEWS.format(quote('"new AI model" OR "model release" OR "launches model" when:7d')), "feed"),
    ("Hacker News", "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60", "hn"),
)
SPORTS_FEEDS = (
    ("cricket", "ESPNcricinfo", "https://www.espncricinfo.com/rss/content/story/feeds/0.xml", "feed"),
    ("cricket", "BBC Sport", "https://feeds.bbci.co.uk/sport/cricket/rss.xml", "feed"),
    ("football", "ESPN", ESPN.format("soccer/eng.1"), "espn"),
    ("football", "ESPN", ESPN.format("soccer/uefa.champions"), "espn"),
    ("football", "BBC Sport", "https://feeds.bbci.co.uk/sport/football/rss.xml", "feed"),
    ("tennis", "ESPN", ESPN.format("tennis/atp"), "espn"),
    ("tennis", "ESPN", ESPN.format("tennis/wta"), "espn"),
    ("tennis", "BBC Sport", "https://feeds.bbci.co.uk/sport/tennis/rss.xml", "feed"),
    ("f1", "ESPN", ESPN.format("racing/f1"), "espn"),
    ("f1", "BBC Sport", "https://www.bbc.co.uk/sport/formula1/rss.xml", "feed"),
)


def get(url):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urlopen(request, timeout=TIMEOUT) as response:
        return world._inflate(response.read(world.MAX_FEED_BYTES))


def _now():
    return datetime.now(timezone.utc)


def _parse(kind, data, name, now):
    if kind == "hn":
        return world.parse_hn(json.loads(data), now)
    return world.parse_feed(data, name, now)


def _read_all(jobs, read):
    """Run read(job) for every job in parallel; return (results, one status row per job)."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(read, job) for job in jobs]
        results, status = [], []
        for job, future in zip(jobs, futures):
            try:
                value = future.result(timeout=TIMEOUT * 3)
                results.append(value)
                status.append({"source": job[0] if isinstance(job[0], str) else job[1], "ok": True})
            except Exception as exc:
                results.append(None)
                status.append({"source": job[0] if isinstance(job[0], str) else job[1], "ok": False, "error": type(exc).__name__})
    return results, status


def markets():
    def read(job):
        symbol, name = job
        quote_ = world.parse_quote(json.loads(get(CHART.format(symbol))), symbol)
        return {**quote_, "label": name}
    results, status = _read_all(TICKERS, read)
    quotes = [q for q in results if q]
    return {"ok": bool(quotes), "quotes": quotes, "sources": status, "checked_at": _now().isoformat(timespec="seconds"),
            "source": "Yahoo Finance (may be delayed)", **({} if quotes else {"error": "No quotes could be read."})}


def news():
    now = _now()

    def read(job):
        name, url, kind = job
        return _parse(kind, get(url), name, now)
    results, status = _read_all(NEWS_FEEDS, read)
    items = world.merge([item for batch in results if batch for item in batch], limit=45)
    return {"ok": bool(items), "items": items, "sources": status, "checked_at": now.isoformat(timespec="seconds"),
            **({} if items else {"error": "No AI headlines could be read."})}


def models():
    now = _now()
    items = world.parse_models(json.loads(get("https://openrouter.ai/api/v1/models")), now)
    return {"ok": bool(items), "items": items, "source": "OpenRouter model catalogue", "checked_at": now.isoformat(timespec="seconds"),
            **({} if items else {"error": "No recent model releases were listed."})}


def sports():
    now = _now()

    def read(job):
        sport, name, url, kind = job
        data = get(url)
        items = world.parse_espn_news(json.loads(data), sport, name, now) if kind == "espn" else world.parse_feed(data, name, now)
        return [{**item, "sport": sport} for item in items]
    results, status = _read_all(SPORTS_FEEDS, read)
    for row, job in zip(status, SPORTS_FEEDS):
        row["source"] = f"{job[1]} · {job[0]}"
    items = []
    for sport in ("cricket", "football", "tennis", "f1"):
        items += world.merge([item for batch in results if batch for item in batch if item["sport"] == sport], limit=12)
    items.sort(key=lambda item: item["published"], reverse=True)
    return {"ok": bool(items), "items": items, "sources": status, "checked_at": now.isoformat(timespec="seconds"),
            **({} if items else {"error": "No sports headlines could be read."})}


SECTIONS = {"markets": markets, "news": news, "models": models, "sports": sports}


def fetch(section):
    if section not in SECTIONS:
        raise ValueError("Unknown section.")
    return SECTIONS[section]()


if __name__ == "__main__":
    try:
        result = fetch(sys.argv[1] if len(sys.argv) > 1 else "")
    except Exception as exc:                          # a worker always answers with JSON
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:200]}
    print(json.dumps(result))

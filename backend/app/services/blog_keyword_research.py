"""Weekly keyword research for the blog autopilot.

Collects what people in the US and UK are actually searching, from free sources:
  - Google and Bing autocomplete (current searches, ordered by popularity)
  - Bing Webmaster keyword stats (real weekly search counts -> volume and trend)
then groups the phrases into topics and scores them. No paid tools, no scraping of
result pages. Every network call is best-effort: a failing source is skipped, the
run carries on with whatever the other sources returned.
"""

from __future__ import annotations

import logging
import math
import re
import string
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)

COUNTRIES = {"us": ("us", "en-US"), "gb": ("gb", "en-GB")}

# Seed topics across everyday life with diabetes: blood sugar, food, activity, lifestyle.
# Topics are ranked purely on search demand - these seeds only decide where we look.
SEEDS = [
    "blood sugar levels", "normal blood sugar", "high blood sugar", "blood sugar after eating", "fasting blood sugar",
    "morning blood sugar", "a1c levels", "lower a1c", "prediabetes", "gestational diabetes", "type 2 diabetes",
    "type 1 diabetes", "insulin resistance", "exercise diabetes", "walking blood sugar", "diabetes weight loss",
    "diabetes sleep", "stress blood sugar", "diabetes travel", "diabetes eating out", "glucose monitor",
    "check blood sugar", "diabetes and pregnancy", "diabetes in older adults", "living with diabetes",

    "diabetic breakfast", "diabetic lunch ideas", "diabetic dinner", "diabetic snacks", "diabetic desserts",
    "diabetic meal plan", "diabetic diet", "type 2 diabetes diet", "prediabetes diet", "gestational diabetes diet",
    "low carb diabetic", "foods to avoid with diabetes", "best foods for diabetics", "fruit for diabetics",
    "vegetables for diabetics", "bread for diabetics", "rice diabetes", "pasta diabetes", "potatoes diabetes",
    "oatmeal diabetes", "eggs diabetes", "cheese diabetes", "yogurt diabetes", "nuts diabetes", "beans diabetes",
    "sweeteners diabetes", "alcohol diabetes", "coffee diabetes", "smoothies for diabetics", "diabetic recipes",
    "blood sugar spike after eating", "foods that lower blood sugar", "a1c diet", "insulin resistance diet",
    "high fiber foods diabetes", "high protein diabetic", "diabetic friendly fast food", "diabetic christmas",
    "diabetic thanksgiving", "carbs for diabetics",
]
# Question stems expanded a-z: these surface the long-tail questions people actually type.
QUESTION_STEMS = [
    "can diabetics eat", "is good for diabetics", "can diabetics drink", "is bad for diabetics",
    "how many carbs", "best diabetic", "does raise blood sugar",
    "why is my blood sugar", "how to lower blood sugar", "what is a normal", "how to lower a1c",
    "can prediabetes", "how does diabetes", "is it normal for blood sugar",
]

TOPIC_RE = re.compile(r"diabet|blood sugar|glucose|a1c|insulin|prediabet|carb", re.I)
# Off-limits: medication/dosing, diagnosis and cures (unsafe for an AI draft), and off-niche searches.
BLOCK_RE = re.compile(
    r"ozempic|mounjaro|wegovy|zepbound|metformin|jardiance|trulicity|semaglutide|tirzepatide|glipizide|"
    r"insulin (dose|dosage|pump|pen|price|cost)|dosage|symptom|sign of|signs of|diagnos|cure|reverse|"
    r"dka|ketoacidosis|blood sugar is low|sugar low\b|sugar levels low|low blood sugar|hypoglyc|hypo\b|amputat|neuropathy|retinopathy|\bdog\b|\bcat\b|\bpet\b|socks|shoes|tattoo|meme|"
    r"insurance|lawsuit|near me|reddit|walmart|amazon|costco|\bdied\b|death",
    re.I,
)
STOPWORDS = set(
    "a an the and or of for to in on with is are be can do does what which how much many best good bad "
    "eat eating drink drinking diabetic diabetics diabetes type 1 2 ii t2d t1d people person someone "
    "patient patients friendly ok okay safe idea ideas easy quick simple healthy list option options tip tips guide".split()
)
SEASONAL = {  # month -> terms worth a boost when the event is 0-6 weeks away
    1: ["new year", "january", "valentine"], 2: ["valentine", "ramadan", "lent"], 3: ["ramadan", "easter"],
    4: ["easter", "ramadan"], 5: ["bbq", "barbecue", "summer"], 6: ["bbq", "barbecue", "summer", "4th of july"],
    7: ["summer", "bbq", "4th of july"], 8: ["back to school"], 9: ["halloween", "fall", "autumn"],
    10: ["halloween", "thanksgiving", "christmas"], 11: ["thanksgiving", "christmas"], 12: ["christmas", "new year"],
}

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GlucoForagerResearch/1.0; +https://www.glucoforager.com)"}


@dataclass
class Phrase:
    text: str
    hits: set[tuple[str, str]] = field(default_factory=set)  # (engine, country)
    best_rank: int = 99


@dataclass
class Candidate:
    key: str
    keyword: str
    phrases: list[str]
    hits: set[tuple[str, str]]
    best_rank: int
    bing_volume: int | None = None
    trend: float | None = None
    recipe_matches: int = 0
    seasonal: bool = False
    score: float = 0.0

    def signals(self) -> dict:
        return {
            "countries": sorted({c for _, c in self.hits}),
            "engines": sorted({e for e, _ in self.hits}),
            "phrases": len(self.phrases),
            "best_rank": self.best_rank,
            "bing_volume": self.bing_volume,
            "trend": None if self.trend is None else round(self.trend, 2),
            "recipe_matches": self.recipe_matches,
            "seasonal": self.seasonal,
        }


# ---------- sources ----------


def google_suggest(client: httpx.Client, query: str, country: str) -> list[str]:
    try:
        r = client.get(
            "https://suggestqueries.google.com/complete/search",
            params={"client": "firefox", "hl": "en", "gl": country, "q": query},
        )
        if r.status_code != 200:
            return []
        data = r.json()
        return [s for s in data[1] if isinstance(s, str)] if len(data) > 1 else []
    except Exception:  # noqa: BLE001
        return []


def bing_suggest(client: httpx.Client, query: str, country: str) -> list[str]:
    try:
        r = client.get("https://api.bing.com/osjson.aspx", params={"query": query, "market": COUNTRIES[country][1]})
        if r.status_code != 200:
            return []
        data = r.json()
        return [s for s in data[1] if isinstance(s, str)] if len(data) > 1 else []
    except Exception:  # noqa: BLE001
        return []


def _bing_api(client: httpx.Client, method: str, **params) -> list[dict] | None:
    key = (settings.bing_webmaster_api_key or "").strip()
    if not key:
        return None
    try:
        r = client.get(
            f"https://ssl.bing.com/webmaster/api.svc/json/{method}",
            params={**params, "apikey": key},
            timeout=20,
        )
        if r.status_code != 200:
            logger.info("Bing %s returned %s", method, r.status_code)
            return None
        data = r.json().get("d")
        return data if isinstance(data, list) else None
    except Exception as exc:  # noqa: BLE001
        logger.info("Bing %s failed: %s", method, exc)
        return None


def _bing_date(value) -> date | None:
    m = re.search(r"/Date\((\d+)", str(value or ""))
    if not m:
        return None
    return date.fromtimestamp(int(m.group(1)) / 1000)


def bing_keyword_stats(client: httpx.Client, query: str, country: str) -> tuple[int, float | None] | None:
    """Last-4-weeks search count and trend (last 4 weeks / previous 4 weeks) from Bing."""
    rows = _bing_api(client, "GetKeywordStats", q=query, country=country, language=COUNTRIES[country][1])
    if not rows:
        return None
    weekly = []
    for row in rows:
        d = _bing_date(row.get("Date"))
        count = row.get("BroadImpressions") or row.get("Impressions") or row.get("BroadCount") or 0
        if d:
            weekly.append((d, int(count or 0)))
    weekly.sort()
    if not weekly:
        return None
    recent = sum(c for _, c in weekly[-4:])
    previous = sum(c for _, c in weekly[-8:-4])
    trend = (recent / previous) if previous > 0 else None
    return recent, trend


def bing_related_keywords(client: httpx.Client, query: str, country: str, weeks: int = 4) -> list[tuple[str, int]]:
    end = date.today()
    start = end - timedelta(weeks=weeks)
    rows = _bing_api(
        client,
        "GetRelatedKeywords",
        q=query,
        country=country,
        language=COUNTRIES[country][1],
        startDate=start.isoformat(),
        endDate=end.isoformat(),
    )
    out = []
    for row in rows or []:
        q = str(row.get("Query") or "").strip()
        if q:
            out.append((q, int(row.get("BroadImpressions") or row.get("Impressions") or 0)))
    return out


# ---------- processing ----------


def is_relevant(text: str) -> bool:
    return bool(TOPIC_RE.search(text)) and not BLOCK_RE.search(text) and 8 <= len(text) <= 90


def topic_key(text: str) -> str:
    """Words that make a search distinct, so 'is oatmeal good for diabetics' and
    'oatmeal for type 2 diabetes' land in the same topic."""
    words = re.findall(r"[a-z0-9']+", text.lower())
    core = []
    for w in words:
        w = w.strip("'")
        if w.endswith("'s"):
            w = w[:-2]
        if not w or w in STOPWORDS:
            continue
        if len(w) > 3 and w.endswith("es") and not w.endswith("ses"):
            w = w[:-2] if w[:-2].endswith(("o", "ch", "sh")) else w[:-1]
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        core.append(w)
    return " ".join(sorted(set(core)))


def overlaps(key_a: str, key_b: str, threshold: float = 0.6) -> bool:
    a, b = set(key_a.split()), set(key_b.split())
    if not a or not b:
        return False
    return len(a & b) / len(a | b) >= threshold


def collect_phrases(client: httpx.Client, *, delay: float = 0.35) -> dict[str, Phrase]:
    queries = list(SEEDS)
    for stem in QUESTION_STEMS:
        queries.append(stem)
        queries.extend(f"{stem} {letter}" for letter in string.ascii_lowercase)

    phrases: dict[str, Phrase] = {}
    for query in queries:
        for country in COUNTRIES:
            for engine, fn in (("google", google_suggest), ("bing", bing_suggest)):
                for rank, text in enumerate(fn(client, query, country)):
                    text = re.sub(r"\s+", " ", text.strip().lower())
                    if not is_relevant(text):
                        continue
                    p = phrases.setdefault(text, Phrase(text))
                    p.hits.add((engine, country))
                    p.best_rank = min(p.best_rank, rank)
                time.sleep(delay)
    return phrases


def cluster(phrases: dict[str, Phrase]) -> list[Candidate]:
    groups: dict[str, list[Phrase]] = defaultdict(list)
    for p in phrases.values():
        key = topic_key(p.text)
        if key:
            groups[key].append(p)
    out = []
    for key, items in groups.items():
        # Most widely seen phrase (then most popular, then shortest) names the topic.
        items.sort(key=lambda p: (-len(p.hits), p.best_rank, len(p.text)))
        hits = set().union(*(p.hits for p in items))
        out.append(
            Candidate(
                key=key,
                keyword=items[0].text,
                phrases=[p.text for p in items],
                hits=hits,
                best_rank=min(p.best_rank for p in items),
            )
        )
    return out


def is_seasonal(text: str, today: date) -> bool:
    soon = {today.month, (today + timedelta(weeks=6)).month}
    return any(term in text for m in soon for term in SEASONAL.get(m, []))


def score(c: Candidate) -> float:
    """Search demand only: real Bing volume counts most, then how widely and how often it's searched."""
    s = 0.0
    if c.bing_volume:
        s += 3 * math.log1p(c.bing_volume)
    s += 1.5 * len(c.hits)  # seen in both countries / both engines
    s += math.sqrt(len(c.phrases))  # many people asking around the same thing
    s += max(0, 10 - c.best_rank) * 0.25  # near the top of autocomplete
    if c.trend is not None and c.trend >= 1.2:
        s += min(4.0, 2 * (c.trend - 1))
    if c.seasonal:
        s += 3
    return round(s, 2)


def research(
    *,
    covered_keys: list[str],
    recipe_names: list[str],
    today: date | None = None,
    client: httpx.Client | None = None,
    volume_lookups: int = 60,
) -> list[Candidate]:
    """Full weekly run: returns candidates ranked best first, already-covered topics removed."""
    today = today or date.today()
    own = client is None
    client = client or httpx.Client(timeout=10, headers=_HEADERS, follow_redirects=True)
    try:
        phrases = collect_phrases(client)
        # Bing's related keywords add phrases autocomplete misses, with real counts.
        for seed in SEEDS[:12]:
            for country in COUNTRIES:
                for text, _count in bing_related_keywords(client, seed, country):
                    text = text.lower().strip()
                    if is_relevant(text):
                        phrases.setdefault(text, Phrase(text)).hits.add(("bing", country))
        logger.info("Blog research: %s relevant phrases", len(phrases))

        stems = set(QUESTION_STEMS) | {topic_key(s) for s in QUESTION_STEMS}
        candidates = [
            c
            for c in cluster(phrases)
            if c.keyword not in stems and c.key not in stems and not any(overlaps(c.key, k) for k in covered_keys)
        ]
        recipe_keys = [set(topic_key(n).split()) for n in recipe_names]
        for c in candidates:
            words = set(c.key.split())
            c.recipe_matches = sum(1 for rk in recipe_keys if words & rk)
            c.seasonal = is_seasonal(" ".join(c.phrases), today)
            c.score = score(c)

        # Real volumes for the strongest topics only (keeps the API calls modest).
        candidates.sort(key=lambda c: c.score, reverse=True)
        for c in candidates[:volume_lookups]:
            total, trends = 0, []
            for country in COUNTRIES:
                stats = bing_keyword_stats(client, c.keyword, country)
                if stats:
                    total += stats[0]
                    if stats[1] is not None:
                        trends.append(stats[1])
            if total:
                c.bing_volume = total
            if trends:
                c.trend = sum(trends) / len(trends)
            c.score = score(c)
        candidates.sort(key=lambda c: c.score, reverse=True)
        return candidates
    finally:
        if own:
            client.close()


def diverse(candidates: list[Candidate], limit: int, per_word: int = 2) -> list[Candidate]:
    """Best-first shortlist where no main word (e.g. 'christma', 'rice') appears more than per_word times."""
    counts: dict[str, int] = defaultdict(int)
    out = []
    for c in candidates:
        words = c.key.split()
        if any(counts[w] >= per_word for w in words):
            continue
        out.append(c)
        for w in words:
            counts[w] += 1
        if len(out) >= limit:
            break
    return out


def autocomplete_questions(keyword: str, client: httpx.Client | None = None) -> list[str]:
    """Draft-day refresh: the latest real searches around one topic, for the FAQ."""
    own = client is None
    client = client or httpx.Client(timeout=10, headers=_HEADERS, follow_redirects=True)
    core = " ".join(w for w in keyword.split() if w not in STOPWORDS) or keyword
    queries = [keyword] + [f"{q} {core}" for q in ("is", "can", "how", "what", "why", "best")]
    seen: dict[str, int] = {}
    try:
        for q in queries:
            for country in COUNTRIES:
                for fn in (google_suggest, bing_suggest):
                    for text in fn(client, q, country):
                        text = text.strip().lower()
                        if is_relevant(text) and text != keyword:
                            seen[text] = seen.get(text, 0) + 1
                    time.sleep(0.2)
    finally:
        if own:
            client.close()
    return [t for t, _ in sorted(seen.items(), key=lambda kv: -kv[1])][:15]

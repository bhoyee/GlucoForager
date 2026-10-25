"""Blog autopilot: plans the week from real searches and writes drafts for a human
to review. It never publishes and never emails readers - every post is saved as a
draft, and only an admin publishing it in the blog editor puts it live.

Sunday evening (UK): research US/UK searches -> pick 3 topics + 3 reserves -> email the plan.
Mon/Wed/Fri 6am (UK): refresh that day's questions -> AI draft -> save as draft -> email a review link.
"""

from __future__ import annotations

import html as _html
import json
import logging
import re
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

import httpx
from openai import OpenAI
from sqlalchemy import update
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.blog_post import BlogPost
from ..models.blog_topic import BlogTopic
from .blog_keyword_research import Candidate, autocomplete_questions, diverse, research, topic_key
from .html_sanitizer import RICH_CONTENT_ALLOWED_ATTRS, RICH_CONTENT_ALLOWED_TAGS, sanitize_html

logger = logging.getLogger(__name__)

AUTHOR_NAME = "GlucoForager Team"
DRAFT_WEEKDAYS = (0, 2, 4)  # Mon, Wed, Fri
PLANNED_PER_WEEK = len(DRAFT_WEEKDAYS)
RESERVES_PER_WEEK = 3
MIN_WORDS = 900

# Sources the writer may cite. Links are still checked live before saving; dead ones are unlinked.
TRUSTED_SOURCES = {
    "American Diabetes Association": "https://diabetes.org/food-nutrition",
    "Diabetes UK": "https://www.diabetes.org.uk/living-with-diabetes/eating",
    "NHS": "https://www.nhs.uk/conditions/type-2-diabetes/food-and-keeping-active/",
    "CDC": "https://www.cdc.gov/diabetes/healthy-eating/index.html",
    "CDC meal planning": "https://www.cdc.gov/diabetes/healthy-eating/diabetes-meal-planning.html",
    "NIDDK": "https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes",
}
TRUSTED_HOSTS = {
    "diabetes.org", "www.diabetes.org", "www.diabetes.org.uk", "diabetes.org.uk", "www.nhs.uk", "nhs.uk",
    "www.cdc.gov", "cdc.gov", "www.niddk.nih.gov", "niddk.nih.gov", "nutritionsource.hsph.harvard.edu",
    "www.who.int", "who.int", "medlineplus.gov", "www.medlineplus.gov",
}


def _site() -> str:
    return (settings.site_url or "https://www.glucoforager.com").rstrip("/")


def week_monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def planning_week(today: date) -> date:
    """The Sunday run plans the coming week; a run on any other day plans the current one."""
    return week_monday(today + timedelta(days=1)) if today.weekday() == 6 else week_monday(today)


def _client() -> OpenAI | None:
    key = (settings.openai_api_key or "").strip()
    return OpenAI(api_key=key, max_retries=1, timeout=180) if key else None


def _ask_json(system: str, user: str, *, temperature: float = 0.4) -> dict | None:
    client = _client()
    if not client:
        return None
    resp = client.chat.completions.create(
        model=settings.blog_autopilot_model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    try:
        return json.loads(resp.choices[0].message.content or "{}")
    except (ValueError, IndexError):
        return None


# ---------- planning ----------


def covered_keys(db: Session) -> list[str]:
    keys = []
    for title, focus in db.query(BlogPost.title, BlogPost.focus_keyword).all():
        for text in (title, focus):
            if text:
                keys.append(topic_key(text))
    since = date.today() - timedelta(weeks=26)
    for (kw,) in db.query(BlogTopic.keyword).filter(BlogTopic.week_of >= since, BlogTopic.status != "skipped"):
        keys.append(topic_key(kw))
    return [k for k in keys if k]


def reason_text(signals: dict) -> str:
    parts = []
    countries = "+".join(c.upper().replace("GB", "UK") for c in signals.get("countries") or [])
    engines = "+".join(e.title() for e in signals.get("engines") or [])
    if countries:
        parts.append(f"searched in {countries}" + (f" on {engines}" if engines else ""))
    if signals.get("bing_volume"):
        parts.append(f"~{signals['bing_volume']:,} Bing searches in 4 weeks")
    trend = signals.get("trend")
    if trend and trend >= 1.1:
        parts.append(f"rising {round((trend - 1) * 100)}%")
    if signals.get("phrases", 0) > 1:
        parts.append(f"{signals['phrases']} related searches")
    if signals.get("recipe_matches"):
        parts.append(f"links to {min(signals['recipe_matches'], 99)} of our recipes")
    if signals.get("seasonal"):
        parts.append("seasonal, coming up soon")
    text = ", ".join(parts)
    return text[:1].upper() + text[1:] if text else "Popular search"


def choose_topics(candidates: list[Candidate], existing_titles: list[str], count: int) -> list[dict]:
    """AI editor picks a varied, safe set from the top candidates; falls back to pure score order."""
    shortlist = diverse(candidates, 30)
    picks: list[dict] = []
    try:
        listing = "\n".join(
            f"{i}. \"{c.keyword}\" | score {c.score} | {reason_text(c.signals())} | also: {'; '.join(c.phrases[1:5])}"
            for i, c in enumerate(shortlist)
        )
        data = _ask_json(
            "You are the content editor of GlucoForager, a diabetes-friendly recipe and meal-planning app "
            "for people in the US and UK. You choose blog topics from real search data.",
            f"""Pick the {count} best blog topics from this list, best first.
Rules:
- Choose by search demand: the score reflects how much people search it, so prefer high scores.
- Any everyday diabetes/prediabetes topic is fine: food, blood sugar, A1C, exercise, sleep, weight, lifestyle.
  Skip medication, dosing, diagnosis, symptoms, complications and anything that needs a clinician to answer.
- Keep the set varied (not three fruit posts or three blood sugar posts).
- Skip anything already covered by these existing posts: {json.dumps(existing_titles[:60])}
For each pick give: index, title_idea (a click-worthy, honest title under 65 characters that contains the
search phrase naturally), angle (one sentence: what the post answers and how), reason (one short sentence).
Return JSON: {{"picks": [{{"index": 0, "title_idea": "", "angle": "", "reason": ""}}]}}

Candidates:
{listing}""",
            temperature=0.3,
        )
        seen = set()
        for p in (data or {}).get("picks") or []:
            i = p.get("index")
            if isinstance(i, int) and 0 <= i < len(shortlist) and i not in seen:
                seen.add(i)
                picks.append({"candidate": shortlist[i], **{k: str(p.get(k) or "")[:300] for k in ("title_idea", "angle", "reason")}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Blog autopilot: AI topic pick failed, using score order: %s", exc)
    for c in shortlist:
        if len(picks) >= count:
            break
        if all(p["candidate"] is not c for p in picks):
            picks.append({"candidate": c, "title_idea": "", "angle": "", "reason": ""})
    return picks[:count]


def plan_week(db: Session, *, today: date | None = None, force: bool = False) -> list[BlogTopic]:
    today = today or date.today()
    week_of = planning_week(today)
    existing = db.query(BlogTopic).filter(BlogTopic.week_of == week_of).order_by(BlogTopic.id).all()
    if existing and not force:
        return existing
    for t in existing:  # a forced re-plan replaces topics not yet written
        if t.status in {"planned", "reserve"}:
            db.delete(t)
    db.flush()

    from ..api.endpoints.public_recipes import _all_public  # local import: avoids an API<->service cycle

    recipe_names = [r.name for r in _all_public(db) if r.name]
    candidates = research(covered_keys=covered_keys(db), recipe_names=recipe_names, today=today)
    if not candidates:
        db.commit()
        logger.warning("Blog autopilot: research returned no candidates for week %s", week_of)
        return []

    titles = [t for (t,) in db.query(BlogPost.title).all() if t]
    picks = choose_topics(candidates, titles, PLANNED_PER_WEEK + RESERVES_PER_WEEK)
    taken = {t.planned_for for t in existing if t.status not in {"planned", "reserve"} and t.planned_for}
    days = [week_of + timedelta(days=d) for d in DRAFT_WEEKDAYS]
    open_days = [d for d in days if d not in taken and d >= today]
    topics = []
    for i, pick in enumerate(picks):
        c: Candidate = pick["candidate"]
        signals = c.signals()
        planned_for = open_days[i] if i < len(open_days) else None
        topic = BlogTopic(
            week_of=week_of,
            keyword=c.keyword,
            title_idea=pick["title_idea"] or None,
            angle=pick["angle"] or None,
            related=c.phrases[:20],
            signals=signals,
            score=c.score,
            reason=(reason_text(signals) + (f". {pick['reason']}" if pick["reason"] else ""))[:500],
            status="planned" if planned_for else "reserve",
            planned_for=planned_for,
        )
        db.add(topic)
        topics.append(topic)
    db.commit()
    logger.info("Blog autopilot: planned %s topics for week %s", len(topics), week_of)
    return topics


def swap_topic(db: Session, topic: BlogTopic) -> BlogTopic | None:
    """Skip a planned topic and move the best reserve into its slot."""
    day = topic.planned_for
    topic.status = "skipped"
    topic.planned_for = None
    reserve = (
        db.query(BlogTopic)
        .filter(BlogTopic.week_of == topic.week_of, BlogTopic.status == "reserve")
        .order_by(BlogTopic.score.desc())
        .first()
    )
    if reserve and day:
        reserve.status = "planned"
        reserve.planned_for = day
    db.commit()
    return reserve


def claim_topic(db: Session, *, today: date | None = None, topic_id: int | None = None) -> BlogTopic | None:
    """Atomically take today's planned topic (or a specific one), so a draft is written once."""
    query = db.query(BlogTopic.id)
    if topic_id is not None:
        query = query.filter(BlogTopic.id == topic_id, BlogTopic.status.in_(["planned", "reserve", "failed"]))
    else:
        query = query.filter(BlogTopic.planned_for == (today or date.today()), BlogTopic.status == "planned")
    row = query.order_by(BlogTopic.score.desc()).first()
    if not row:
        return None
    result = db.execute(
        update(BlogTopic)
        .where(BlogTopic.id == row.id, BlogTopic.status.in_(["planned", "reserve", "failed"]))
        .values(status="drafting", error=None, updated_at=datetime.utcnow())
    )
    db.commit()
    if result.rowcount != 1:
        return None
    return db.get(BlogTopic, row.id)


# ---------- drafting ----------


def _recipe_links(db: Session, keyword: str, limit: int = 6) -> list[dict]:
    from ..api.endpoints.public_recipes import _all_public, recipe_slug

    words = set(topic_key(keyword).split())
    recipes = _all_public(db)

    def match(r) -> int:
        text = " ".join([r.name or "", " ".join(str(i.get("name", "")) if isinstance(i, dict) else str(i) for i in (r.ingredients or []))])
        return len(words & set(topic_key(text).split()))

    meal = next((m for m in ("breakfast", "lunch", "dinner", "snack") if m in keyword), None)
    ranked = sorted(recipes, key=lambda r: (match(r), r.meal_type == meal), reverse=True)
    picked = [r for r in ranked if match(r) > 0 or (meal and r.meal_type == meal)][:limit]
    carbs = lambda r: (r.nutrition or {}).get("carbs")  # noqa: E731
    return [
        {
            "name": r.name,
            "url": f"{_site()}/recipes/{recipe_slug(r)}",
            "carbs_g": round(float(carbs(r))) if carbs(r) is not None else None,
            "image_url": r.image_url,
        }
        for r in picked
    ]


def _post_links(db: Session, limit: int = 25) -> list[dict]:
    rows = (
        db.query(BlogPost.title, BlogPost.slug)
        .filter(BlogPost.status == "published")
        .order_by(BlogPost.published_at.desc())
        .limit(limit)
        .all()
    )
    return [{"title": t, "url": f"{_site()}/blog/{s}"} for t, s in rows]


def unique_slug(db: Session, text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:70].strip("-") or "post"
    slug, n = base, 2
    while db.query(BlogPost.id).filter(BlogPost.slug == slug).first():
        slug, n = f"{base}-{n}", n + 1
    return slug


_LINK_RE = re.compile(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.I | re.S)


def _link_ok(client: httpx.Client, url: str) -> bool:
    try:
        r = client.head(url)
        if r.status_code in (403, 405) or r.status_code >= 500:
            r = client.get(url)
        return r.status_code < 400
    except Exception:  # noqa: BLE001
        return False


def clean_links(content: str, allowed_internal: set[str], check_external: bool = True) -> tuple[str, list[str]]:
    """Keep links to our own known pages and live trusted sources; unwrap anything else."""
    removed: list[str] = []
    client = httpx.Client(timeout=10, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) if check_external else None

    def repl(m: re.Match) -> str:
        url, text = m.group(1).strip(), m.group(2)
        host = urlparse(url).netloc.lower()
        if url.rstrip("/") in allowed_internal or url in allowed_internal:
            return f'<a href="{_html.escape(url)}">{text}</a>'
        if host in TRUSTED_HOSTS and (client is None or _link_ok(client, url)):
            return f'<a href="{_html.escape(url)}" target="_blank" rel="noopener noreferrer">{text}</a>'
        removed.append(url)
        return text

    try:
        return _LINK_RE.sub(repl, content), removed
    finally:
        if client:
            client.close()


def word_count(content: str) -> int:
    return len(re.findall(r"\b\w+\b", re.sub(r"<[^>]+>", " ", content)))


def quality_checks(post: dict, content: str, keyword: str) -> list[str]:
    warnings = []
    words = word_count(content)
    if words < MIN_WORDS:
        warnings.append(f"Short: {words} words (aim for {MIN_WORDS}+)")
    if len(re.findall(r"<h2", content, re.I)) < 3:
        warnings.append("Fewer than 3 sections (H2)")
    core = [w for w in topic_key(keyword).split() if len(w) > 2]
    if core and not any(w in (post.get("title") or "").lower() for w in core):
        warnings.append("Search phrase not in the title")
    if not 50 <= len(post.get("seo_description") or "") <= 160:
        warnings.append("Meta description should be 50-160 characters")
    return warnings


DISCLAIMER_HTML = (
    "<hr/><p><em>This article is general information, not medical advice. Everyone's diabetes is different, "
    "so talk to your doctor, diabetes nurse or dietitian before making big changes to your diet or treatment.</em></p>"
)


def _cta_html() -> str:
    return (
        "<h2>Make it easier with GlucoForager</h2>"
        "<p>GlucoForager turns the food you already have into diabetes-friendly recipes, with carbs per serving, "
        "smart swaps and a glucose log that shows how meals affect you. "
        f'<a href="{_site()}/download">Try it free</a> or browse our '
        f'<a href="{_site()}/recipes">free diabetes-friendly recipes</a>.</p>'
    )


WRITER_SYSTEM = """You write for the GlucoForager blog: practical, warm, evidence-based articles about eating well
with diabetes and prediabetes, for adults in the US and UK. You are careful and accurate: you never invent
statistics, studies or quotes, never give medication or dosing advice, and say "talk to your care team" where
individual advice is needed. Write in clear plain English (reading age ~12), short paragraphs, US spelling
with UK terms in brackets where they differ (e.g. zucchini (courgette)). Give carbs in grams and blood sugar
in both mg/dL and mmol/L."""


def _writer_prompt(topic: BlogTopic, questions: list[str], recipes: list[dict], posts: list[dict]) -> str:
    return f"""Write a blog post targeting the search phrase: "{topic.keyword}"
Working title idea: {topic.title_idea or '(write your own)'}
Angle: {topic.angle or 'Answer the search directly and practically.'}
Related searches to cover naturally: {json.dumps((topic.related or [])[:12])}
Real questions people search (answer 4-6 of the best in the FAQ): {json.dumps(questions[:12])}

Structure (HTML using only p, h2, h3, ul, ol, li, strong, em, a, table, thead, tbody, tr, th, td):
1. Opening: a 2-3 sentence direct answer to the search (this is what Google shows), no heading before it.
2. 4-7 H2 sections with practical, specific detail that fully answers what people are searching. For food
   topics: portions, carbs per typical serving, better choices and swaps. A simple table where it genuinely helps.
3. Only if the topic is about food, you may link 1-3 of these recipes where they truly fit (exact URLs only);
   otherwise link none: {json.dumps([{k: r[k] for k in ('name', 'url', 'carbs_g')} for r in recipes])}
4. Optionally link 1-2 related posts (exact URLs only): {json.dumps(posts)}
5. "Frequently asked questions" H2 with each question as an H3 and a 2-4 sentence answer.
6. Cite 2-3 sources inline as links, using only these pages: {json.dumps(TRUSTED_SOURCES)}
Do not add a disclaimer or app promotion - those are added automatically. 1,200-1,800 words.

Return JSON: {{"title": "under 65 chars, contains the phrase naturally", "seo_title": "under 60 chars",
"seo_description": "140-155 chars, contains the phrase, makes people want to click", "excerpt": "1-2 sentences, under 250 chars",
"focus_keyword": "{topic.keyword}", "content_html": "..."}}"""


def write_draft(db: Session, topic: BlogTopic, *, check_links: bool = True) -> BlogPost:
    questions = []
    try:
        questions = autocomplete_questions(topic.keyword)
    except Exception as exc:  # noqa: BLE001
        logger.info("Blog autopilot: question refresh failed: %s", exc)
    topic.questions = questions

    recipes = _recipe_links(db, topic.keyword)
    posts = _post_links(db)
    data = _ask_json(WRITER_SYSTEM, _writer_prompt(topic, questions, recipes, posts), temperature=0.5)
    if not data or not str(data.get("content_html") or "").strip():
        raise RuntimeError("AI returned no article")

    allowed = {r["url"] for r in recipes} | {p["url"] for p in posts} | {f"{_site()}/recipes", f"{_site()}/download"}
    content, removed = clean_links(str(data["content_html"]), allowed, check_external=check_links)
    content = sanitize_html(
        content + _cta_html() + DISCLAIMER_HTML,
        allowed_tags=RICH_CONTENT_ALLOWED_TAGS,
        allowed_attrs=RICH_CONTENT_ALLOWED_ATTRS,
        max_length=1_000_000,
    )
    title = str(data.get("title") or topic.title_idea or topic.keyword).strip()[:160]
    warnings = quality_checks(data, content, topic.keyword)
    if removed:
        warnings.append(f"Removed {len(removed)} unverified link(s)")
    image_url = next((r["image_url"] for r in recipes if r.get("image_url")), None)
    if not image_url:
        warnings.append("No cover image - upload one before publishing")

    post = BlogPost(
        slug=unique_slug(db, title),
        title=title,
        excerpt=(str(data.get("excerpt") or "").strip()[:280] or None),
        image_url=image_url,
        seo_title=(str(data.get("seo_title") or "").strip()[:220] or None),
        seo_description=(str(data.get("seo_description") or "").strip()[:320] or None),
        focus_keyword=topic.keyword[:120],
        content=content,
        status="draft",
        author_name=AUTHOR_NAME,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(post)
    db.flush()
    topic.post_id = post.id
    topic.status = "drafted"
    topic.signals = {**(topic.signals or {}), "checks": warnings, "words": word_count(content)}
    db.commit()
    return post


def draft_topic(db: Session, topic: BlogTopic, *, notify: bool = True) -> BlogPost | None:
    try:
        post = write_draft(db, topic)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        topic = db.get(BlogTopic, topic.id)
        topic.status = "failed"
        topic.error = str(exc)[:500]
        db.commit()
        logger.exception("Blog autopilot: draft failed for topic %s", topic.id)
        if notify:
            from .email_service import send_blog_autopilot_failed_email

            _notify(db, lambda to: send_blog_autopilot_failed_email(to, topic))
        return None
    if notify:
        from .email_service import send_blog_draft_ready_email

        _notify(db, lambda to: send_blog_draft_ready_email(to, post, topic))
    return post


def notify_recipients(db: Session) -> list[str]:
    explicit = [e.strip() for e in (settings.blog_autopilot_notify_email or "").split(",") if e.strip()]
    if explicit:
        return explicit
    from .settings_service import get_signup_notification_settings

    try:
        recipients = list(get_signup_notification_settings(db).recipients or [])
    except Exception:  # noqa: BLE001
        recipients = []
    return recipients or ["hello@glucoforager.com"]


def _notify(db: Session, send) -> None:
    for to in notify_recipients(db):
        try:
            send(to)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Blog autopilot email to %s failed: %s", to, exc)


# ---------- scheduled jobs ----------


def run_weekly_plan_job() -> None:
    if not settings.blog_autopilot_enabled:
        return
    from ..database import SessionLocal
    from .email_service import send_blog_week_plan_email

    db = SessionLocal()
    try:
        topics = plan_week(db)
        if topics:
            _notify(db, lambda to: send_blog_week_plan_email(to, topics))
    except Exception:
        logger.exception("Blog autopilot weekly plan failed")
    finally:
        db.close()


def run_draft_day_job() -> None:
    if not settings.blog_autopilot_enabled:
        return
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        today = date.today()
        if not db.query(BlogTopic.id).filter(BlogTopic.week_of == week_monday(today)).first():
            plan_week(db, today=today)  # the Sunday run was missed (e.g. a restart): plan now
        topic = claim_topic(db, today=today)
        if topic:
            draft_topic(db, topic)
    except Exception:
        logger.exception("Blog autopilot draft day failed")
    finally:
        db.close()

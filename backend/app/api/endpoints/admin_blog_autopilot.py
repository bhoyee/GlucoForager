"""Admin: the blog autopilot's weekly topic plan - review, swap, re-plan, draft now."""

from __future__ import annotations

import logging
import threading
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin, require_staff_permission
from ...core.config import settings
from ...database import SessionLocal, get_db
from ...models.admin_user import AdminUser
from ...models.blog_post import BlogPost
from ...models.blog_topic import BlogTopic
from ...services import blog_autopilot

router = APIRouter(prefix="/admin/blog/autopilot", tags=["admin-blog"])
logger = logging.getLogger(__name__)

_RUNNING: dict[str, bool] = {"plan": False}


def _topic(t: BlogTopic, posts: dict[int, BlogPost]) -> dict:
    post = posts.get(t.post_id) if t.post_id else None
    return {
        "id": t.id,
        "week_of": t.week_of.isoformat(),
        "keyword": t.keyword,
        "title_idea": t.title_idea,
        "angle": t.angle,
        "reason": t.reason,
        "score": t.score,
        "signals": t.signals or {},
        "questions": t.questions or [],
        "related": (t.related or [])[:10],
        "status": t.status,
        "planned_for": t.planned_for.isoformat() if t.planned_for else None,
        "error": t.error,
        "post": {"id": post.id, "title": post.title, "status": post.status, "slug": post.slug} if post else None,
    }


@router.get("")
def autopilot_overview(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
    staff: AdminUser = Depends(require_staff_permission("blog.read")),  # noqa: ARG001
):
    since = blog_autopilot.week_monday(date.today()) - timedelta(weeks=4)
    topics = (
        db.query(BlogTopic)
        .filter(BlogTopic.week_of >= since)
        .order_by(BlogTopic.week_of.desc(), BlogTopic.planned_for.asc().nulls_last(), BlogTopic.score.desc())
        .all()
    )
    post_ids = [t.post_id for t in topics if t.post_id]
    posts = {p.id: p for p in db.query(BlogPost).filter(BlogPost.id.in_(post_ids)).all()} if post_ids else {}
    return {
        "enabled": bool(settings.blog_autopilot_enabled),
        "bing_configured": bool((settings.bing_webmaster_api_key or "").strip()),
        "ai_configured": bool((settings.openai_api_key or "").strip()),
        "planning": _RUNNING["plan"],
        "topics": [_topic(t, posts) for t in topics],
    }


class PlanRequest(BaseModel):
    force: bool = False


def _plan_in_background(force: bool) -> None:
    db = SessionLocal()
    try:
        blog_autopilot.plan_week(db, force=force)
    except Exception:
        logger.exception("Manual blog plan failed")
    finally:
        _RUNNING["plan"] = False
        db.close()


@router.post("/plan", status_code=202)
def run_plan(
    payload: PlanRequest,
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
    staff: AdminUser = Depends(require_staff_permission("blog.write")),  # noqa: ARG001
):
    if _RUNNING["plan"]:
        raise HTTPException(status_code=409, detail="Research is already running")
    _RUNNING["plan"] = True
    threading.Thread(target=_plan_in_background, args=(payload.force,), daemon=True).start()
    return {"started": True, "note": "Research takes about 10 minutes."}


@router.post("/topics/{topic_id}/swap")
def swap(
    topic_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
    staff: AdminUser = Depends(require_staff_permission("blog.write")),  # noqa: ARG001
):
    topic = db.get(BlogTopic, topic_id)
    if not topic or topic.status not in {"planned", "reserve", "failed"}:
        raise HTTPException(status_code=404, detail="Topic can't be swapped")
    replacement = blog_autopilot.swap_topic(db, topic)
    return {"skipped": topic_id, "replacement": replacement.id if replacement else None}


def _draft_in_background(topic_id: int) -> None:
    db = SessionLocal()
    try:
        topic = blog_autopilot.claim_topic(db, topic_id=topic_id)
        if topic:
            blog_autopilot.draft_topic(db, topic)
    finally:
        db.close()


@router.post("/topics/{topic_id}/draft", status_code=202)
def draft_now(
    topic_id: int,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),  # noqa: ARG001
    staff: AdminUser = Depends(require_staff_permission("blog.write")),  # noqa: ARG001
):
    topic = db.get(BlogTopic, topic_id)
    if not topic or topic.status not in {"planned", "reserve", "failed"}:
        raise HTTPException(status_code=409, detail="Topic is already drafted or in progress")
    threading.Thread(target=_draft_in_background, args=(topic_id,), daemon=True).start()
    return {"started": True, "note": "The draft takes 1-2 minutes; you'll get an email when it's ready."}

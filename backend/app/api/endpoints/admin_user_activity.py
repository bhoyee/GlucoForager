from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import and_, false, func, or_
from sqlalchemy.orm import Session

from ..admin_dependencies import require_staff_permission
from ...database import get_db
from ...models.staff_user import StaffUser
from ...models.user import User
from ...models.user_activity_event import UserActivityEvent


router = APIRouter(prefix="/admin/user-activity", tags=["admin-user-activity"])
logger = logging.getLogger(__name__)


def _utc_iso(value):
    if not value:
        return None
    raw = value.isoformat()
    if raw.endswith("Z") or "+" in raw[10:] or "-" in raw[10:]:
        return raw
    return f"{raw}Z"


def _is_recipe_image_ai_event(event: UserActivityEvent) -> bool:
    metadata = event.metadata_json or {}
    return (
        event.event_type == "ai.request"
        and isinstance(metadata, dict)
        and metadata.get("request_type") == "recipe_image"
    )


def _dedupe_feed_rows(rows: list[tuple[UserActivityEvent, User]], limit_value: int) -> list[tuple[UserActivityEvent, User]]:
    collapsed: list[tuple[UserActivityEvent, User]] = []
    recent_recipe_image_by_user: dict[int, object] = {}

    for event, user in rows:
        if _is_recipe_image_ai_event(event):
            previous_time = recent_recipe_image_by_user.get(event.user_id)
            if previous_time and event.created_at and abs((previous_time - event.created_at).total_seconds()) <= 120:
                continue
            recent_recipe_image_by_user[event.user_id] = event.created_at

        collapsed.append((event, user))
        if len(collapsed) >= limit_value:
            break

    return collapsed


def _dedupe_all_rows(rows: list[tuple[UserActivityEvent, User]]) -> list[tuple[UserActivityEvent, User]]:
    collapsed: list[tuple[UserActivityEvent, User]] = []
    recent_recipe_image_by_user: dict[int, object] = {}

    for event, user in rows:
        if _is_recipe_image_ai_event(event):
            previous_time = recent_recipe_image_by_user.get(event.user_id)
            if previous_time and event.created_at and abs((previous_time - event.created_at).total_seconds()) <= 120:
                continue
            recent_recipe_image_by_user[event.user_id] = event.created_at
        collapsed.append((event, user))

    return collapsed


def _serialize_activity(event: UserActivityEvent, user: User) -> dict:
    return {
        "id": event.id,
        "user_id": event.user_id,
        "user_email": user.email,
        "user_name": user.full_name,
        "event_type": event.event_type,
        "label": event.label,
        "source": event.source,
        "metadata": event.metadata_json or {},
        "created_at": _utc_iso(event.created_at),
        "last_active_at": _utc_iso(getattr(user, "last_active_at", None)),
    }


@router.get("/recent")
def recent_user_activity(
    limit: int = 25,
    user_id: int | None = None,
    event_type: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    limit_value = max(1, min(100, int(limit or 25)))
    query = db.query(UserActivityEvent, User).join(User, User.id == UserActivityEvent.user_id)

    if user_id is not None:
        query = query.filter(UserActivityEvent.user_id == int(user_id))
    if event_type:
        query = query.filter(UserActivityEvent.event_type == str(event_type).strip())

    rows = (
        query.order_by(UserActivityEvent.created_at.desc(), UserActivityEvent.id.desc())
        .limit(limit_value * 5)
        .all()
    )
    rows = _dedupe_feed_rows(rows, limit_value)
    logger.info(
        "admin_user_activity.recent limit=%s user_id=%s event_type=%s rows=%s",
        limit_value,
        user_id,
        event_type,
        len(rows),
    )

    return {
        "items": [_serialize_activity(event, user) for event, user in rows],
        "limit": limit_value,
    }


@router.get("")
def list_user_activity(
    page: int = 1,
    page_size: int = 25,
    q: str | None = None,
    user_id: int | None = None,
    event_type: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    page_value = max(1, int(page or 1))
    page_size_value = max(1, min(100, int(page_size or 25)))
    query = db.query(UserActivityEvent, User).join(User, User.id == UserActivityEvent.user_id)

    if user_id is not None:
        query = query.filter(UserActivityEvent.user_id == int(user_id))
    if event_type:
        query = query.filter(UserActivityEvent.event_type == str(event_type).strip())
    if source:
        query = query.filter(UserActivityEvent.source == str(source).strip())
    if q and q.strip():
        needle = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.email.ilike(needle),
                User.full_name.ilike(needle),
                UserActivityEvent.label.ilike(needle),
                UserActivityEvent.event_type.ilike(needle),
            )
        )

    raw_rows = (
        query.order_by(UserActivityEvent.created_at.desc(), UserActivityEvent.id.desc())
        .limit(1000)
        .all()
    )
    rows = _dedupe_all_rows(raw_rows)
    total = len(rows)
    page_rows = rows[(page_value - 1) * page_size_value : page_value * page_size_value]

    return {
        "items": [_serialize_activity(event, user) for event, user in page_rows],
        "page": page_value,
        "page_size": page_size_value,
        "total": total,
    }


class ActivityBulkDeletePayload(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=1000)


class ActivityDeleteAllPayload(BaseModel):
    q: str | None = None
    user_id: int | None = None
    event_type: str | None = None
    source: str | None = None


@router.post("/bulk-delete")
def bulk_delete_user_activity(
    payload: ActivityBulkDeletePayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.write")),  # noqa: ARG001
):
    deleted = (
        db.query(UserActivityEvent)
        .filter(UserActivityEvent.id.in_(payload.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted_count": int(deleted or 0)}


@router.post("/delete-all")
def delete_all_user_activity(
    payload: ActivityDeleteAllPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.write")),  # noqa: ARG001
):
    query = db.query(UserActivityEvent)

    if payload.user_id is not None:
        query = query.filter(UserActivityEvent.user_id == int(payload.user_id))
    if payload.event_type:
        query = query.filter(UserActivityEvent.event_type == payload.event_type.strip())
    if payload.source:
        query = query.filter(UserActivityEvent.source == payload.source.strip())
    if payload.q and payload.q.strip():
        needle = f"%{payload.q.strip()}%"
        matching_user_ids = db.query(User.id).filter(
            or_(User.email.ilike(needle), User.full_name.ilike(needle))
        )
        query = query.filter(
            or_(
                UserActivityEvent.user_id.in_(matching_user_ids),
                UserActivityEvent.label.ilike(needle),
                UserActivityEvent.event_type.ilike(needle),
            )
        )

    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"deleted_count": int(deleted or 0)}


# ── Feature usage (admin "Activity" chart) ────────────────────────────────────
# Raw event names over-count: one recipe generation logs started/running/completed,
# and "ai.request" mixes every AI call (incl. automatic recipe images). So usage is
# counted per *feature*, once per real use, from exactly one event each.
FEATURE_DEFS: list[tuple[str, str, str, str | None]] = [
    # (key, label, event_type, ai request_type or None)
    ("recipes", "Recipe ideas", "recipe_generation.started", None),
    ("fridge_scan", "Fridge scans", "scan_analysis.started", None),
    ("glucoguide", "GlucoGuide questions", "ai.request", "agent"),
    ("food_scan", "Food photo scans", "ai.request", "food_scan"),
    ("barcode", "Barcode scans", "barcode.scanned", None),
    ("swaps", "Food swaps", "ai.request", "swaps"),
    ("meal_plan", "Meal plans", "daily_plan.created", None),
    ("meal_log", "Meals logged", "meal_log.created", None),
    ("glucose_log", "Glucose logged", "glucose_reading.created", None),
    ("challenge", "Challenge tasks done", "challenge.task_completed", None),
    ("favorite", "Favourites saved", "favorite.saved", None),
    ("login", "Logins", "auth.login", None),
]


def _feature_key(event_type: str, metadata) -> str | None:
    request_type = metadata.get("request_type") if isinstance(metadata, dict) else None
    for key, _label, ev, rt in FEATURE_DEFS:
        if event_type == ev and (rt is None or rt == request_type):
            return key
    return None


@router.get("/feature-usage")
def feature_usage(
    days: int = 7,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    """Uses + unique users per feature for the last `days` days vs the period before,
    plus a daily series for the trend chart. Days are UTC calendar days."""
    from datetime import datetime, timedelta

    # Activity events are kept ~2 months, so the period + the one before it must fit in 60 days.
    days_value = days if days in (7, 14, 30) else 7
    today = datetime.utcnow().date()
    start_day = today - timedelta(days=days_value - 1)
    prev_start_day = start_day - timedelta(days=days_value)
    window_start = datetime.combine(prev_start_day, datetime.min.time())

    rows = (
        db.query(
            UserActivityEvent.user_id,
            UserActivityEvent.event_type,
            UserActivityEvent.metadata_json,
            UserActivityEvent.created_at,
        )
        .filter(
            UserActivityEvent.created_at >= window_start,
            UserActivityEvent.event_type.in_({ev for _k, _l, ev, _rt in FEATURE_DEFS}),
        )
        .all()
    )

    dates = [(start_day + timedelta(days=i)).isoformat() for i in range(days_value)]
    day_index = {d: i for i, d in enumerate(dates)}
    stats = {key: {"uses": 0, "users": set(), "prev_uses": 0, "prev_users": set()} for key, *_ in FEATURE_DEFS}
    series = {key: [0] * days_value for key, *_ in FEATURE_DEFS}
    active_users: set[int] = set()
    prev_active_users: set[int] = set()

    for user_id, event_type, metadata, created_at in rows:
        key = _feature_key(event_type, metadata)
        if not key or created_at is None:
            continue
        day = created_at.date()
        if day >= start_day:
            stats[key]["uses"] += 1
            stats[key]["users"].add(user_id)
            active_users.add(user_id)
            idx = day_index.get(day.isoformat())
            if idx is not None:
                series[key][idx] += 1
        else:
            stats[key]["prev_uses"] += 1
            stats[key]["prev_users"].add(user_id)
            prev_active_users.add(user_id)

    def change_pct(now: int, before: int) -> int | None:
        if before == 0:
            return None
        return round(100 * (now - before) / before)

    features = []
    for key, label, _ev, _rt in FEATURE_DEFS:
        s = stats[key]
        features.append(
            {
                "key": key,
                "label": label,
                "uses": s["uses"],
                "users": len(s["users"]),
                "prev_uses": s["prev_uses"],
                "prev_users": len(s["prev_users"]),
                "change_pct": change_pct(s["uses"], s["prev_uses"]),
            }
        )
    features.sort(key=lambda f: (-f["uses"], -f["users"], f["label"]))

    return {
        "days": days_value,
        "generated_at": _utc_iso(datetime.utcnow()),
        "active_users": len(active_users),
        "prev_active_users": len(prev_active_users),
        "features": features,
        "dates": dates,
        "series": series,
    }


# ── One user's activity (admin user page "Activity" tab) ──────────────────────
# Every event is grouped into the feature it belongs to, so the timeline can be
# filtered by feature and the summary counts real uses. (key, label, event_type
# prefixes, ai.request request_types)
USER_FEATURE_GROUPS: list[tuple[str, str, tuple[str, ...], tuple[str, ...]]] = [
    ("recipes", "Recipe ideas", ("recipe_generation.",), ("text", "recipes")),
    ("fridge_scan", "Fridge scans", ("scan_analysis.",), ("vision", "vision_batch")),
    ("food_scan", "Food photo scans", (), ("food_scan", "meal_estimate")),
    ("barcode", "Barcode scans", ("barcode.",), ()),
    ("glucoguide", "GlucoGuide AI", (), ("agent",)),
    ("swaps", "Food swaps", (), ("swaps",)),
    ("meal_plan", "Meal plans", ("daily_plan.", "meal_plan."), ("daily_plan",)),
    ("meal_log", "Meals logged", ("meal_log.",), ()),
    ("glucose", "Glucose readings", ("glucose_reading.",), ()),
    ("challenge", "Daily challenge", ("challenge.",), ()),
    ("favorites", "Saved recipes", ("favorite.",), ()),
    ("recipe_check_in", "Recipe check-ins", ("recipe.check_in",), ()),
    ("shopping", "Shopping list", ("shopping_list.",), ()),
    ("recipe_search", "Recipe search", ("recipe.search",), ()),
    ("account", "Sign-in & account", ("auth.", "push_token."), ()),
]
_GROUP_LABELS = {key: label for key, label, _p, _r in USER_FEATURE_GROUPS}

# One event per real use, for the summary counts (other events are steps of the same use).
_USE_EVENTS = {
    "recipes": ("recipe_generation.started", None),
    "fridge_scan": ("scan_analysis.started", None),
    "food_scan": ("ai.request", ("food_scan", "meal_estimate")),
    "barcode": ("barcode.scanned", None),
    "glucoguide": ("ai.request", ("agent",)),
    "swaps": ("ai.request", ("swaps",)),
    "meal_plan": ("daily_plan.created", None),
    "meal_log": ("meal_log.created", None),
    "glucose": ("glucose_reading.created", None),
    "challenge": ("challenge.task_completed", None),
    "favorites": ("favorite.saved", None),
    "recipe_check_in": ("recipe.check_in", None),
    "shopping": ("shopping_list.created", None),
    "recipe_search": ("recipe.search", None),
    "account": ("auth.login", None),
}

_AI_LABELS = {
    "food_scan": "Scanned a food photo",
    "meal_estimate": "Estimated a meal's carbs",
    "text": "AI wrote recipe ideas",
    "vision": "AI read a fridge photo",
    "vision_batch": "AI read fridge photos",
    "agent": "Asked GlucoGuide AI",
    "swaps": "Generated food swaps",
    "daily_plan": "AI built a daily meal plan",
}

# Automatic or intermediate AI steps already represented by another event.
_TECHNICAL_AI = ("recipe_image", "text", "vision", "vision_batch", "daily_plan")


def _request_type(metadata) -> str | None:
    return metadata.get("request_type") if isinstance(metadata, dict) else None


def user_event_feature(event_type: str, metadata) -> str | None:
    request_type = _request_type(metadata)
    for key, _label, prefixes, request_types in USER_FEATURE_GROUPS:
        if event_type == "ai.request":
            if request_type in request_types:
                return key
        elif any(event_type.startswith(p) for p in prefixes):
            return key
    return None


def is_technical_event(event_type: str, metadata) -> bool:
    """Automatic or intermediate steps: hidden unless 'show technical events' is on."""
    return (
        event_type.endswith(".running")
        or event_type == "push_token.updated"
        or (event_type == "ai.request" and _request_type(metadata) in _TECHNICAL_AI)
    )


def _request_type_sql():
    return func.coalesce(UserActivityEvent.metadata_json["request_type"].as_string(), "")


def _feature_sql(key: str):
    for k, _label, prefixes, request_types in USER_FEATURE_GROUPS:
        if k != key:
            continue
        parts = [and_(UserActivityEvent.event_type != "ai.request", UserActivityEvent.event_type.like(f"{p}%")) for p in prefixes]
        if request_types:
            parts.append(and_(UserActivityEvent.event_type == "ai.request", _request_type_sql().in_(request_types)))
        return or_(*parts)
    return None


def _not_technical_sql():
    return and_(
        ~UserActivityEvent.event_type.like("%.running"),
        UserActivityEvent.event_type != "push_token.updated",
        or_(UserActivityEvent.event_type != "ai.request", ~_request_type_sql().in_(_TECHNICAL_AI)),
    )


def _serialize_user_event(event: UserActivityEvent) -> dict:
    metadata = event.metadata_json or {}
    feature = user_event_feature(event.event_type, metadata)
    label = event.label
    if event.event_type == "ai.request":
        label = _AI_LABELS.get(_request_type(metadata), label)
    return {
        "id": event.id,
        "event_type": event.event_type,
        "label": label,
        "feature": feature,
        "feature_label": _GROUP_LABELS.get(feature, "Other"),
        "source": event.source,
        "technical": is_technical_event(event.event_type, metadata),
        "metadata": metadata,
        "created_at": _utc_iso(event.created_at),
    }


@router.get("/user/{user_id}")
def user_activity_timeline(
    user_id: int,
    page: int = 1,
    page_size: int = 25,
    feature: str | None = None,
    include_technical: bool = False,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    """One user's activity, newest first, paginated in the database."""
    page_value = max(1, int(page or 1))
    page_size_value = max(1, min(100, int(page_size or 25)))
    query = db.query(UserActivityEvent).filter(UserActivityEvent.user_id == int(user_id))
    if not include_technical:
        query = query.filter(_not_technical_sql())
    if feature:
        condition = _feature_sql(feature.strip())
        query = query.filter(condition if condition is not None else false())

    total = query.count()
    rows = (
        query.order_by(UserActivityEvent.created_at.desc(), UserActivityEvent.id.desc())
        .offset((page_value - 1) * page_size_value)
        .limit(page_size_value)
        .all()
    )
    return {
        "items": [_serialize_user_event(e) for e in rows],
        "page": page_value,
        "page_size": page_size_value,
        "total": total,
    }


@router.get("/user/{user_id}/summary")
def user_activity_summary(
    user_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(require_staff_permission("users.read")),  # noqa: ARG001
):
    """Which features this user uses, how often, and how active they are."""
    from datetime import datetime, timedelta

    days_value = days if days in (7, 30, 60) else 30
    since = datetime.utcnow() - timedelta(days=days_value)
    rows = (
        db.query(UserActivityEvent.event_type, UserActivityEvent.metadata_json, UserActivityEvent.created_at)
        .filter(UserActivityEvent.user_id == int(user_id), UserActivityEvent.created_at >= since)
        .all()
    )

    uses: dict[str, int] = {key: 0 for key, *_ in USER_FEATURE_GROUPS}
    last_used: dict[str, datetime] = {}
    active_days: set = set()
    actions = 0
    for event_type, metadata, created_at in rows:
        if is_technical_event(event_type, metadata):
            continue
        actions += 1
        if created_at:
            active_days.add(created_at.date())
        for key, (use_event, request_types) in _USE_EVENTS.items():
            if event_type == use_event and (request_types is None or _request_type(metadata) in request_types):
                uses[key] += 1
                if created_at and (key not in last_used or created_at > last_used[key]):
                    last_used[key] = created_at
                break

    features = [
        {"key": key, "label": label, "uses": uses[key], "last_used_at": _utc_iso(last_used.get(key))}
        for key, label, _p, _r in USER_FEATURE_GROUPS
        if uses[key] > 0
    ]
    features.sort(key=lambda f: (-f["uses"], f["label"]))
    last_event = db.query(func.max(UserActivityEvent.created_at)).filter(UserActivityEvent.user_id == int(user_id)).scalar()
    user = db.get(User, int(user_id))
    product_features = [f for f in features if f["key"] != "account"]
    return {
        "days": days_value,
        "actions": actions,
        "active_days": len(active_days),
        "last_activity_at": _utc_iso(last_event),
        "last_active_at": _utc_iso(getattr(user, "last_active_at", None)) if user else None,
        "top_feature": product_features[0]["label"] if product_features else None,
        "features": features,
        "feature_options": [{"key": k, "label": label} for k, label, _p, _r in USER_FEATURE_GROUPS],
    }

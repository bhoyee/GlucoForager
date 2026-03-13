import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...services.mobile_log_service import LOG_DIR
from ...services.tip_catalog_service import get_catalog, save_catalog
from ...services.tip_catalog_service import _default_catalog  # type: ignore[attr-defined]

router = APIRouter(prefix="/admin/tips", tags=["admin-tips"])


def _iter_mobile_log_lines(*, max_files: int = 14) -> list[str]:
    folder = Path(LOG_DIR)
    if not folder.exists():
        return []
    files = sorted(folder.glob("mobile-client.log*"), key=lambda p: p.stat().st_mtime, reverse=True)
    lines: list[str] = []
    for path in files[: max(1, int(max_files))]:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for line in text.splitlines():
            if line.strip():
                lines.append(line)
    return lines


class TipUpsertPayload(BaseModel):
    id: str | None = Field(None, max_length=80)
    title: str = Field(..., min_length=2, max_length=120)
    tip: str = Field(..., min_length=2, max_length=260)
    why: str = Field(..., min_length=2, max_length=260)
    try_today: str = Field(..., min_length=2, max_length=260)
    category: str | None = Field(None, max_length=40)
    active: bool = True


def _slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    cleaned = "-".join([part for part in cleaned.split("-") if part])
    return cleaned[:80] or "tip"


@router.get("")
def list_tips(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    return {"items": get_catalog(db)}


@router.post("")
def create_tip(
    payload: TipUpsertPayload,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    catalog = get_catalog(db)
    used_ids = {str(item.get("id") or "").strip() for item in catalog if isinstance(item, dict)}
    tip_id = (payload.id or "").strip() or _slugify(payload.title)
    base_id = tip_id
    i = 2
    while tip_id in used_ids:
        tip_id = f"{base_id}-{i}"
        i += 1
        if i > 999:
            raise HTTPException(status_code=409, detail="Unable to allocate a unique tip id.")
    item = {
        "id": tip_id,
        "title": payload.title.strip(),
        "tip": payload.tip.strip(),
        "why": payload.why.strip(),
        "try_today": payload.try_today.strip(),
        "category": (payload.category or "").strip() or "general",
        "active": bool(payload.active),
    }
    catalog.append(item)
    save_catalog(db, catalog)
    return {"item": item}


@router.put("/{tip_id}")
def update_tip(
    tip_id: str,
    payload: TipUpsertPayload,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    tip_id = (tip_id or "").strip()
    if not tip_id:
        raise HTTPException(status_code=422, detail="tip_id is required")
    catalog = get_catalog(db)
    updated = None
    for item in catalog:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "").strip() != tip_id:
            continue
        item["title"] = payload.title.strip()
        item["tip"] = payload.tip.strip()
        item["why"] = payload.why.strip()
        item["try_today"] = payload.try_today.strip()
        item["category"] = (payload.category or "").strip() or item.get("category") or "general"
        item["active"] = bool(payload.active)
        updated = item
        break
    if not updated:
        raise HTTPException(status_code=404, detail="Tip not found")
    save_catalog(db, catalog)
    return {"item": updated}


@router.delete("/{tip_id}")
def delete_tip(
    tip_id: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    tip_id = (tip_id or "").strip()
    catalog = get_catalog(db)
    next_items = [
        item
        for item in catalog
        if not (isinstance(item, dict) and str(item.get("id") or "").strip() == tip_id)
    ]
    if len(next_items) == len(catalog):
        raise HTTPException(status_code=404, detail="Tip not found")
    save_catalog(db, next_items)
    return {"status": "deleted"}


@router.post("/seed")
def seed_tips(
    mode: str = "upsert",
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    """Seed the curated tip catalog into app_settings.

    mode:
      - upsert (default): update existing tips by id, add missing tips
      - replace: replace the entire catalog with the seeded tips
    """
    mode_norm = (mode or "").strip().lower()
    if mode_norm not in {"upsert", "replace"}:
        raise HTTPException(status_code=422, detail="mode must be upsert or replace")

    seed_items = _default_catalog()
    if not isinstance(seed_items, list) or not seed_items:
        raise HTTPException(status_code=500, detail="Seed catalog is empty")

    cleaned_seed: list[dict] = []
    for item in seed_items:
        if not isinstance(item, dict):
            continue
        tip_id = str(item.get("id") or "").strip()
        if not tip_id:
            continue
        cleaned_seed.append(
            {
                "id": tip_id,
                "title": str(item.get("title") or "").strip(),
                "tip": str(item.get("tip") or "").strip(),
                "why": str(item.get("why") or "").strip(),
                "try_today": str(item.get("try_today") or "").strip(),
                "category": str(item.get("category") or "general").strip() or "general",
                "active": bool(item.get("active", True)),
            }
        )

    if mode_norm == "replace":
        save_catalog(db, cleaned_seed)
        return {
            "mode": mode_norm,
            "added": len(cleaned_seed),
            "updated": 0,
            "total": len(cleaned_seed),
            "seed_default_count": len(seed_items),
        }

    existing = get_catalog(db)
    by_id: dict[str, dict] = {}
    for item in existing:
        if isinstance(item, dict):
            tid = str(item.get("id") or "").strip()
            if tid:
                by_id[tid] = item

    added = 0
    updated = 0
    for item in cleaned_seed:
        tid = item["id"]
        if tid in by_id:
            # Update in place to keep any unknown fields, but normalize core fields.
            target = by_id[tid]
            for k in ("title", "tip", "why", "try_today", "category", "active"):
                target[k] = item.get(k)
            updated += 1
        else:
            existing.append(item)
            added += 1

    save_catalog(db, existing)
    return {
        "mode": mode_norm,
        "added": added,
        "updated": updated,
        "total": len(existing),
        "seed_default_count": len(seed_items),
    }


@router.get("/feedback-summary")
def tip_feedback_summary(
    days: int = 7,
    limit_events: int = 10000,
    max_files: int = 14,
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    days = max(1, min(int(days), 30))
    limit_events = max(100, min(int(limit_events), 200000))
    max_files = max(1, min(int(max_files), 60))

    cutoff = datetime.now(timezone.utc).timestamp() - (days * 24 * 60 * 60)
    raw_lines = _iter_mobile_log_lines(max_files=max_files)

    helpful_total = 0
    not_useful_total = 0
    per_tip: dict[str, dict] = {}
    latest: list[dict] = []
    unique_helpful_users: set[int] = set()
    unique_not_useful_users: set[int] = set()

    for line in raw_lines:
        if len(latest) >= limit_events:
            break
        try:
            event = json.loads(line)
        except Exception:
            continue

        if not isinstance(event, dict):
            continue

        source = (event.get("source") or "").strip()
        message = (event.get("message") or "").strip()
        if source != "TodayTip" or message != "Tip feedback":
            continue

        ts_raw = event.get("timestamp") or event.get("received_at")
        ts = None
        if isinstance(ts_raw, str) and ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00")).timestamp()
            except Exception:
                ts = None
        if ts is not None and ts < cutoff:
            continue

        details_raw = event.get("details")
        details = None
        if isinstance(details_raw, str) and details_raw.strip():
            try:
                details = json.loads(details_raw)
            except Exception:
                details = None

        tip_id = None
        title = None
        feedback = None
        reason = None
        if isinstance(details, dict):
            tip_id = details.get("tip_id")
            title = details.get("title")
            feedback = details.get("feedback")
            reason = details.get("reason")
        if not tip_id and isinstance(title, str):
            tip_id = title
        tip_id = str(tip_id or "").strip() or "unknown"
        reason = str(reason or "").strip() or None

        bucket = per_tip.setdefault(
            tip_id,
            {
                "tip_id": tip_id,
                "title": title,
                "helpful": 0,
                "not_useful": 0,
                "total": 0,
                "last_seen": ts_raw,
                "reasons": {},
                "unique_users_helpful": 0,
                "unique_users_not_useful": 0,
                "unique_users_total": 0,
            },
        )

        if isinstance(title, str) and title.strip():
            bucket["title"] = title.strip()
        if ts_raw:
            bucket["last_seen"] = ts_raw

        user_id_raw = event.get("user_id")
        user_id = None
        try:
            if user_id_raw is not None:
                user_id = int(user_id_raw)
        except Exception:
            user_id = None

        if feedback == "helpful":
            bucket["helpful"] += 1
            helpful_total += 1
            if user_id is not None:
                unique_helpful_users.add(user_id)
        elif feedback == "not_useful":
            bucket["not_useful"] += 1
            not_useful_total += 1
            if user_id is not None:
                unique_not_useful_users.add(user_id)
            if reason:
                reasons = bucket.get("reasons")
                if isinstance(reasons, dict):
                    reasons[reason] = int(reasons.get(reason, 0) or 0) + 1
        else:
            # Unknown feedback value; ignore counts but still include in latest list.
            pass
        bucket["total"] += 1

        # Track per-tip unique user counts (best effort; requires logged-in user_id).
        if user_id is not None:
            seen_users = bucket.setdefault("_seen_users", set())
            if isinstance(seen_users, set):
                if user_id not in seen_users:
                    seen_users.add(user_id)
                    bucket["unique_users_total"] += 1
            if feedback == "helpful":
                seen_h = bucket.setdefault("_seen_helpful", set())
                if isinstance(seen_h, set):
                    if user_id not in seen_h:
                        seen_h.add(user_id)
                        bucket["unique_users_helpful"] += 1
            if feedback == "not_useful":
                seen_n = bucket.setdefault("_seen_not_useful", set())
                if isinstance(seen_n, set):
                    if user_id not in seen_n:
                        seen_n.add(user_id)
                        bucket["unique_users_not_useful"] += 1

        latest.append(
            {
                "timestamp": ts_raw,
                "tip_id": tip_id,
                "title": bucket.get("title"),
                "feedback": feedback,
                "reason": reason,
                "user_id": event.get("user_id"),
                "user_email": event.get("user_email"),
                "app_version": event.get("app_version"),
                "device": event.get("device"),
            }
        )

    # Remove internal sets from payload.
    for value in per_tip.values():
        value.pop("_seen_users", None)
        value.pop("_seen_helpful", None)
        value.pop("_seen_not_useful", None)

    items = sorted(per_tip.values(), key=lambda x: (x.get("not_useful", 0), x.get("total", 0)), reverse=True)
    return {
        "window_days": days,
        "totals": {
            "helpful": helpful_total,
            "not_useful": not_useful_total,
            "events": helpful_total + not_useful_total,
            "unique_users_helpful": len(unique_helpful_users),
            "unique_users_not_useful": len(unique_not_useful_users),
        },
        "items": items,
        "latest": latest[:200],
    }

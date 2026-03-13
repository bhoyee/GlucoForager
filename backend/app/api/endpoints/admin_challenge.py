import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.user import User
from ...models.user_daily_challenge import UserDailyChallenge
from ...services.daily_challenge_service import get_catalog, save_catalog


router = APIRouter(prefix="/admin/challenge", tags=["admin-challenge"])


class ChallengeTaskUpsert(BaseModel):
    id: str = Field(..., min_length=2, max_length=80)
    task_text: str = Field(..., min_length=2, max_length=180)
    category: str = Field(..., min_length=2, max_length=40)
    active: bool = True


class ChallengeCatalogPayload(BaseModel):
    items: list[ChallengeTaskUpsert]


def _parse_json_list(value: str) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
    except Exception:
        return []
    return data if isinstance(data, list) else []


@router.get("/tasks")
def list_challenge_tasks(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    return {"items": get_catalog(db)}


@router.put("/tasks")
def replace_challenge_tasks(
    payload: ChallengeCatalogPayload,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    items = [
        {
            "id": item.id.strip(),
            "task_text": item.task_text.strip(),
            "category": item.category.strip(),
            "active": bool(item.active),
        }
        for item in payload.items
    ]
    if not items:
        raise HTTPException(status_code=422, detail="items must not be empty")
    save_catalog(db, items)
    return {"total": len(items)}


@router.post("/seed")
def seed_challenge_tasks(
    mode: str = "replace",
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    """Seed challenge task catalog from backend/app/data/challenge_tasks.json into app_settings.

    mode:
      - replace (default): replace the entire catalog with the seeded tasks
      - upsert: update existing tasks by id, add missing tasks
    """
    mode_norm = (mode or "").strip().lower()
    if mode_norm not in {"replace", "upsert"}:
        raise HTTPException(status_code=422, detail="mode must be replace or upsert")

    data_path = Path(__file__).resolve().parents[2] / "data" / "challenge_tasks.json"
    if not data_path.exists():
        raise HTTPException(status_code=500, detail="challenge_tasks.json not found")
    try:
        raw = data_path.read_text(encoding="utf-8-sig", errors="ignore")
        parsed = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unable to read challenge_tasks.json: {e}") from e

    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(status_code=500, detail="Seed catalog is empty")

    cleaned_seed: list[dict] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        tid = str(item.get("id") or "").strip()
        text = str(item.get("task_text") or "").strip()
        category = str(item.get("category") or "").strip() or "general"
        if not tid or not text:
            continue
        cleaned_seed.append(
            {
                "id": tid,
                "task_text": text,
                "category": category,
                "active": bool(item.get("active", True)),
            }
        )
    if not cleaned_seed:
        raise HTTPException(status_code=500, detail="No valid seed items found")

    if mode_norm == "replace":
        save_catalog(db, cleaned_seed)
        return {"mode": mode_norm, "added": len(cleaned_seed), "updated": 0, "total": len(cleaned_seed)}

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
            target = by_id[tid]
            for k in ("task_text", "category", "active"):
                target[k] = item.get(k)
            updated += 1
        else:
            existing.append(item)
            added += 1

    save_catalog(db, existing)
    return {"mode": mode_norm, "added": added, "updated": updated, "total": len(existing)}


@router.get("/snapshots")
def list_daily_challenge_snapshots(
    date_iso: str | None = None,
    user_id: int | None = None,
    completed_only: bool = False,
    page: int = 1,
    page_size: int = 50,
    include_tasks: bool = False,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    """List user daily challenge snapshots with basic progress.

    Use date_iso to filter snapshots for a given UTC date (YYYY-MM-DD).
    """
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 200))

    day = None
    if date_iso:
        try:
            day = datetime.strptime(date_iso.strip(), "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=422, detail="date_iso must be YYYY-MM-DD") from None

    q = db.query(UserDailyChallenge, User.email).join(User, User.id == UserDailyChallenge.user_id)
    if day is not None:
        q = q.filter(UserDailyChallenge.date == day)
    if user_id is not None:
        q = q.filter(UserDailyChallenge.user_id == int(user_id))
    if completed_only:
        q = q.filter(UserDailyChallenge.completed_at.isnot(None))

    total = q.count()
    rows = (
        q.order_by(UserDailyChallenge.date.desc(), UserDailyChallenge.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items: list[dict] = []
    for snapshot, email in rows:
        tasks = _parse_json_list(snapshot.tasks_json)
        completed_ids = {str(x) for x in _parse_json_list(snapshot.completed_task_ids_json) if isinstance(x, str)}
        task_ids = [str(t.get("id") or "").strip() for t in tasks if isinstance(t, dict)]
        task_ids = [t for t in task_ids if t]
        total_tasks = len(task_ids)
        completed_count = sum(1 for t in task_ids if t in completed_ids)

        payload: dict = {
            "id": snapshot.id,
            "user_id": snapshot.user_id,
            "user_email": email,
            "date": snapshot.date.isoformat(),
            "completed_count": completed_count,
            "total_tasks": total_tasks,
            "completed_today": bool(total_tasks and completed_count == total_tasks),
            "completed_at": snapshot.completed_at.isoformat() if snapshot.completed_at else None,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
        }

        if include_tasks:
            detailed: list[dict] = []
            for t in tasks:
                if not isinstance(t, dict):
                    continue
                tid = str(t.get("id") or "").strip()
                text = str(t.get("text") or t.get("task_text") or "").strip()
                if not tid or not text:
                    continue
                detailed.append(
                    {
                        "id": tid,
                        "text": text,
                        "category": str(t.get("category") or "general").strip() or "general",
                        "completed": tid in completed_ids,
                    }
                )
            payload["tasks"] = detailed

        items.append(payload)

    return {"page": page, "page_size": page_size, "total": total, "items": items}


@router.post("/reset-snapshots")
def reset_daily_challenge_snapshots(
    date_iso: str | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),  # noqa: ARG001
):
    """Clear daily challenge snapshots (user_daily_challenges) for a given date.

    - Default: clears snapshots for today's UTC date for all users.
    - date_iso: optional YYYY-MM-DD (UTC date).
    - user_id: optional, clear only one user's snapshot for that date.
    """
    if date_iso:
        try:
            day = datetime.strptime(date_iso.strip(), "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=422, detail="date_iso must be YYYY-MM-DD") from None
    else:
        day = datetime.now(timezone.utc).date()

    q = db.query(UserDailyChallenge).filter(UserDailyChallenge.date == day)
    if user_id is not None:
        q = q.filter(UserDailyChallenge.user_id == int(user_id))

    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"date": day.isoformat(), "deleted": int(deleted)}

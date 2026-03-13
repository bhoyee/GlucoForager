import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
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

    data_path = Path(__file__).resolve().parent.parent / "data" / "challenge_tasks.json"
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

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..admin_dependencies import get_current_admin
from ...database import get_db
from ...models.staff_user import StaffUser
from ...models.staff_work_log import StaffWorkLog


router = APIRouter(prefix="/admin/work-logs", tags=["admin-work-logs"])


class WorkLogUpsertPayload(BaseModel):
    work_date: date | None = None
    summary: str = Field("", max_length=1200)
    tasks: list[dict] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)


def _clean_payload(payload: WorkLogUpsertPayload) -> dict:
    tasks_out: list[dict] = []
    for raw in payload.tasks[:50]:
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("text") or "").strip()
        if not text:
            continue
        tasks_out.append({"text": text[:200], "done": bool(raw.get("done", False))})

    links_out: list[str] = []
    for raw in payload.links[:20]:
        s = str(raw or "").strip()
        if not s:
            continue
        links_out.append(s[:300])

    return {"summary": str(payload.summary or "").strip()[:1200], "tasks": tasks_out, "links": links_out}


@router.get("/month")
def get_month(
    year: int,
    month: int,
    staff_user_id: int | None = None,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    staff_id = int(staff_user_id) if staff_user_id is not None else int(current_staff.id)
    staff = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff user not found")

    start = date(int(year), int(month), 1)
    if month == 12:
        end = date(int(year) + 1, 1, 1)
    else:
        end = date(int(year), int(month) + 1, 1)

    rows = (
        db.query(StaffWorkLog)
        .filter(StaffWorkLog.staff_user_id == staff_id, StaffWorkLog.work_date >= start, StaffWorkLog.work_date < end)
        .order_by(StaffWorkLog.work_date.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "staff_user_id": r.staff_user_id,
                "work_date": r.work_date.isoformat(),
                "payload": r.payload,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.post("/upsert")
def upsert_work_log(
    payload: WorkLogUpsertPayload,
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_admin),
):
    work_date = payload.work_date or datetime.now(timezone.utc).date()
    row = (
        db.query(StaffWorkLog)
        .filter(StaffWorkLog.staff_user_id == current_staff.id, StaffWorkLog.work_date == work_date)
        .first()
    )
    cleaned = _clean_payload(payload)
    if not row:
        row = StaffWorkLog(
            staff_user_id=current_staff.id,
            work_date=work_date,
            payload=cleaned,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.payload = cleaned
        row.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id}


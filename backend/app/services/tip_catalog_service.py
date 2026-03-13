import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..models.app_setting import AppSetting
from ..models.user import User


CATALOG_KEY = "tips.catalog.v1"
SETTINGS_KEY = "tips.settings.v1"


ONBOARDING_TIPS: list[dict[str, Any]] = [
    {
        "id": "onboarding-day-1-protein-first",
        "title": "Start meals with protein",
        "tip": "Eat protein before carbohydrate-heavy foods.",
        "why": "Protein slows carbohydrate digestion and may reduce post-meal glucose spikes.",
        "try_today": "Eat eggs, yogurt, or chicken before rice or bread.",
        "category": "meals",
    },
    {
        "id": "onboarding-day-2-veg-first",
        "title": "Eat vegetables before carbs",
        "tip": "Start meals with vegetables whenever possible.",
        "why": "Fiber slows carbohydrate absorption.",
        "try_today": "Eat salad or vegetables before the main meal.",
        "category": "meals",
    },
    {
        "id": "onboarding-day-3-pair-carbs",
        "title": "Never eat carbs alone",
        "tip": "Combine carbohydrates with protein or healthy fat.",
        "why": "Protein and fats slow glucose spikes.",
        "try_today": "Eat apple slices with peanut butter instead of eating fruit alone.",
        "category": "habits",
    },
    {
        "id": "onboarding-day-4-walk-after",
        "title": "Walk after eating",
        "tip": "A short walk after meals helps control blood sugar.",
        "why": "Muscles use glucose during activity.",
        "try_today": "Walk for 10-15 minutes after dinner.",
        "category": "movement",
    },
    {
        "id": "onboarding-day-5-rice-portion",
        "title": "Watch rice portions",
        "tip": "Large portions of rice can spike glucose.",
        "why": "Rice is high in carbohydrates.",
        "try_today": "Reduce rice slightly and add vegetables.",
        "category": "meals",
    },
    {
        "id": "onboarding-day-6-protein-snacks",
        "title": "Snack smarter",
        "tip": "Choose snacks with protein instead of sugary snacks.",
        "why": "Protein snacks stabilize blood sugar.",
        "try_today": "Snack on nuts, yogurt, or boiled eggs.",
        "category": "habits",
    },
    {
        "id": "onboarding-day-7-balanced-plates",
        "title": "Balance every meal",
        "tip": "Build meals with protein, vegetables, and moderate carbs.",
        "why": "Balanced meals reduce glucose spikes.",
        "try_today": "Fill half your plate with vegetables.",
        "category": "meals",
    },
]


def _day_of_year_utc(value: date | None = None) -> int:
    d = value or datetime.now(timezone.utc).date()
    return int(d.timetuple().tm_yday)


def _default_catalog() -> list[dict[str, Any]]:
    # Curated tips are safer than daily AI-generated medical guidance.
    # This is the initial catalog; admins can edit it from the portal.
    data_path = Path(__file__).resolve().parent.parent / "data" / "tips_catalog.json"
    if data_path.exists():
        try:
            # Use utf-8-sig to tolerate a UTF-8 BOM (common on Windows).
            raw = data_path.read_text(encoding="utf-8-sig", errors="ignore")
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                out: list[dict[str, Any]] = []
                for item in parsed:
                    if isinstance(item, dict):
                        # Ensure `active` exists by default.
                        item.setdefault("active", True)
                        out.append(item)
                if out:
                    return out
        except Exception:
            pass

    # Minimal built-in fallback if the JSON file is missing.
    return [
        {
            "id": "protein-first",
            "title": "Eat protein before carbs",
            "tip": "Eat protein or vegetables before carbohydrate-heavy foods.",
            "why": "Food order may reduce post-meal glucose spikes.",
            "try_today": "Eat eggs or yogurt before toast at breakfast.",
            "category": "meals",
            "active": True,
        }
    ]


def get_tip_settings(db: Session) -> dict[str, Any]:
    row = db.query(AppSetting).filter(AppSetting.key == SETTINGS_KEY).first()
    if not row or not row.value:
        return {"blocked_tip_ids": []}
    try:
        data = json.loads(row.value)
    except Exception:
        return {"blocked_tip_ids": []}
    if not isinstance(data, dict):
        return {"blocked_tip_ids": []}
    blocked = data.get("blocked_tip_ids")
    if not isinstance(blocked, list):
        blocked = []
    cleaned: list[str] = []
    for item in blocked:
        if isinstance(item, str):
            s = item.strip()
            if s:
                cleaned.append(s)
    return {"blocked_tip_ids": cleaned}


def _read_catalog_row(db: Session) -> AppSetting | None:
    return db.query(AppSetting).filter(AppSetting.key == CATALOG_KEY).first()


def get_catalog(db: Session) -> list[dict[str, Any]]:
    row = _read_catalog_row(db)
    if not row or not row.value:
        catalog = _default_catalog()
        save_catalog(db, catalog)
        return catalog
    try:
        data = json.loads(row.value)
    except Exception:
        catalog = _default_catalog()
        save_catalog(db, catalog)
        return catalog
    if not isinstance(data, list):
        catalog = _default_catalog()
        save_catalog(db, catalog)
        return catalog
    out: list[dict[str, Any]] = []
    for item in data:
        if isinstance(item, dict):
            out.append(item)
    if not out:
        catalog = _default_catalog()
        save_catalog(db, catalog)
        return catalog

    # Auto-expand a legacy 1-tip catalog into the full curated catalog.
    #
    # This is intentionally conservative: it only triggers if the DB has the
    # original single bootstrap tip, which usually means the admin hasn't
    # seeded the full curated list yet.
    if len(out) == 1 and str(out[0].get("id") or "").strip() == "protein-first":
        seeded = _default_catalog()
        if isinstance(seeded, list) and len(seeded) >= 50:
            existing_by_id = {str(out[0].get("id") or "").strip(): out[0]}
            merged: list[dict[str, Any]] = []
            for item in seeded:
                if not isinstance(item, dict):
                    continue
                tid = str(item.get("id") or "").strip()
                if not tid:
                    continue
                if tid in existing_by_id:
                    merged.append(existing_by_id[tid])
                else:
                    item.setdefault("active", True)
                    merged.append(item)
            if len(merged) > len(out):
                save_catalog(db, merged)
                return merged
    return out


def save_catalog(db: Session, catalog: list[dict[str, Any]]) -> None:
    payload = json.dumps(catalog, ensure_ascii=False)
    row = _read_catalog_row(db)
    if not row:
        row = AppSetting(key=CATALOG_KEY, value=payload)
        db.add(row)
    else:
        row.value = payload
    db.commit()


def get_tip_of_the_day(db: Session, *, on_date: date | None = None) -> dict[str, Any]:
    catalog = get_catalog(db)
    blocked = set(get_tip_settings(db).get("blocked_tip_ids") or [])
    active = [t for t in catalog if t.get("active", True) and str(t.get("id") or "").strip() and t.get("id") not in blocked]
    pool = active if active else [t for t in catalog if str(t.get("id") or "").strip()]
    if not pool:
        return {}
    index = _day_of_year_utc(on_date) % len(pool)
    return pool[index]


def get_tip_for_user(db: Session, user: User | None, *, on_date: date | None = None) -> dict[str, Any]:
    """Return onboarding tip for the first 7 days after signup, else the regular daily rotation."""
    if user and getattr(user, "created_at", None):
        created_at = user.created_at
        try:
            created_date = created_at.date()
        except Exception:
            created_date = None
        today = on_date or datetime.now(timezone.utc).date()
        if created_date:
            days_since = (today - created_date).days
            if 0 <= days_since < len(ONBOARDING_TIPS):
                blocked = set(get_tip_settings(db).get("blocked_tip_ids") or [])
                tip = ONBOARDING_TIPS[days_since]
                # If an onboarding tip is blocked, fall back to normal rotation for that day.
                if str(tip.get("id") or "") not in blocked:
                    return tip
    return get_tip_of_the_day(db, on_date=on_date)

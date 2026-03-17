import json
import random
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..models.app_setting import AppSetting
from ..models.user import User
from ..models.user_daily_challenge import UserDailyChallenge


CATALOG_KEY = "challenge.tasks.v1"
SETTINGS_KEY = "challenge.settings.v1"

_PROFILE_KEYS = {"type_2", "prediabetes", "type_1", "gestational", "managing", "prefer_not"}


DEFAULT_CATEGORIES: list[str] = [
    "meal_structure",
    "food_choice",
    "activity",
    "hydration",
    "portion_control",
    "awareness",
]

# Balanced daily mix (6 tasks):
# - 2 meal-related tasks (meal_structure + portion_control)
# - 1 activity task
# - 1 nutrition/food choice task
# - 1 hydration task
# - 1 habit/reflection task (awareness)
#
# Note: if tasks_per_day becomes 7, we add one extra "awareness" slot.
DEFAULT_CATEGORY_SLOTS: list[str] = [
    "meal_structure",
    "portion_control",
    "activity",
    "food_choice",
    "hydration",
    "awareness",
]


def _utc_today(value: date | None = None) -> date:
    return value or datetime.now(timezone.utc).date()


def _default_catalog() -> list[dict[str, Any]]:
    data_path = Path(__file__).resolve().parent.parent / "data" / "challenge_tasks.json"
    if data_path.exists():
        try:
            raw = data_path.read_text(encoding="utf-8-sig", errors="ignore")
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                out: list[dict[str, Any]] = []
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    item.setdefault("active", True)
                    item.setdefault("audience_profiles", [])
                    item.setdefault("exclude_profiles", [])
                    out.append(item)
                if out:
                    return out
        except Exception:
            pass

    return [
        {
            "id": "protein-first",
            "task_text": "Start a meal with protein or vegetables",
            "category": "meal_structure",
            "active": True,
            "audience_profiles": [],
            "exclude_profiles": [],
        }
    ]


def _read_setting(db: Session, key: str) -> AppSetting | None:
    return db.query(AppSetting).filter(AppSetting.key == key).first()


def get_challenge_settings(db: Session) -> dict[str, Any]:
    row = _read_setting(db, SETTINGS_KEY)
    if not row or not row.value:
        return {"tasks_per_day": 6, "allow_seventh": True}
    try:
        data = json.loads(row.value)
    except Exception:
        return {"tasks_per_day": 6, "allow_seventh": True}
    if not isinstance(data, dict):
        return {"tasks_per_day": 6, "allow_seventh": True}
    tasks_per_day = int(data.get("tasks_per_day") or 6)
    allow_seventh = bool(data.get("allow_seventh", True))
    return {"tasks_per_day": max(4, min(tasks_per_day, 7)), "allow_seventh": allow_seventh}


def get_catalog(db: Session) -> list[dict[str, Any]]:
    row = _read_setting(db, CATALOG_KEY)
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
    return out


def save_catalog(db: Session, catalog: list[dict[str, Any]]) -> None:
    payload = json.dumps(catalog, ensure_ascii=False)
    row = _read_setting(db, CATALOG_KEY)
    if not row:
        row = AppSetting(key=CATALOG_KEY, value=payload)
        db.add(row)
    else:
        row.value = payload
    db.commit()


def _seeded_random(user_id: int, on_date: date, extra: str) -> random.Random:
    seed = f"{user_id}:{on_date.isoformat()}:{extra}"
    return random.Random(seed)

def _normalize_blood_sugar_profile(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    if not cleaned or cleaned not in _PROFILE_KEYS:
        return None
    return cleaned


def _clean_profile_list(values: Any, *, max_items: int = 6) -> list[str]:
    if not values or not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if not isinstance(raw, str):
            continue
        s = raw.strip().lower()
        if not s or s not in _PROFILE_KEYS:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= max_items:
            break
    return out


def _matches_profile(item: dict[str, Any], bsp: str | None) -> bool:
    """Return True if the challenge task applies to the user's blood sugar profile.

    Rules:
    - If audience_profiles is empty/missing, treat as universal.
    - If audience_profiles is non-empty, require bsp to be included.
    - exclude_profiles always wins.
    """
    if not isinstance(item, dict):
        return False
    audience = _clean_profile_list(item.get("audience_profiles"), max_items=6)
    exclude = _clean_profile_list(item.get("exclude_profiles"), max_items=6)
    if bsp and bsp in exclude:
        return False
    if not audience:
        return True
    if not bsp:
        return False
    return bsp in audience


def _pick_tasks_for_day(db: Session, *, user: User, on_date: date) -> list[dict[str, Any]]:
    catalog = get_catalog(db)
    bsp = _normalize_blood_sugar_profile(getattr(user, "blood_sugar_profile", None))

    active = [
        item
        for item in catalog
        if isinstance(item, dict)
        and bool(item.get("active", True))
        and str(item.get("id") or "").strip()
        and str(item.get("task_text") or "").strip()
    ]
    # Normalize legacy items missing targeting fields.
    for item in active:
        if isinstance(item, dict):
            item.setdefault("audience_profiles", [])
            item.setdefault("exclude_profiles", [])
    if not active:
        active = _default_catalog()

    # Only include tasks applicable to the user's blood sugar profile.
    applicable: list[dict[str, Any]] = [item for item in active if _matches_profile(item, bsp)]
    if not applicable:
        applicable = active

    universal_pool: list[dict[str, Any]] = []
    targeted_pool: list[dict[str, Any]] = []
    for item in applicable:
        audience = _clean_profile_list(item.get("audience_profiles"), max_items=6)
        if audience:
            targeted_pool.append(item)
        else:
            universal_pool.append(item)

    # If the user has no profile (or "prefer_not"), treat everything as universal.
    if not bsp or bsp == "prefer_not":
        universal_pool = applicable
        targeted_pool = []

    by_category_universal: dict[str, list[dict[str, Any]]] = {}
    for item in universal_pool:
        cat = str(item.get("category") or "general").strip() or "general"
        by_category_universal.setdefault(cat, []).append(item)

    by_category_targeted: dict[str, list[dict[str, Any]]] = {}
    for item in targeted_pool:
        cat = str(item.get("category") or "general").strip() or "general"
        by_category_targeted.setdefault(cat, []).append(item)

    settings = get_challenge_settings(db)
    tasks_per_day = int(settings.get("tasks_per_day") or 6)
    tasks_per_day = max(4, min(tasks_per_day, 7))

    # Occasionally allow 7 tasks (deterministic per user/day so it doesn't flip).
    if tasks_per_day == 6 and bool(settings.get("allow_seventh", True)):
        r = _seeded_random(int(user.id), on_date, "allow_seventh")
        if r.randint(1, 10) == 1:
            tasks_per_day = 7

    picked: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    # Prefer a mix of universal + targeted tasks while keeping a balanced category mix.
    universal_target = min(3, tasks_per_day)
    targeted_target = max(0, tasks_per_day - universal_target)
    if not targeted_pool:
        targeted_target = 0
        universal_target = tasks_per_day

    slots = list(DEFAULT_CATEGORY_SLOTS)
    if tasks_per_day >= 7:
        slots.append("awareness")
    slots = slots[:tasks_per_day]

    remaining_universal = max(0, int(universal_target))
    remaining_targeted = max(0, int(targeted_target))

    def _pick_one(
        *,
        category: str,
        prefer: str,
        seed_prefix: str,
    ) -> dict[str, Any] | None:
        # prefer: "universal" | "targeted"
        pools = []
        if prefer == "targeted":
            pools = [("targeted", by_category_targeted), ("universal", by_category_universal)]
        else:
            pools = [("universal", by_category_universal), ("targeted", by_category_targeted)]

        for label, by_cat in pools:
            pool = by_cat.get(category) or []
            available = [x for x in pool if str(x.get("id") or "").strip() not in used_ids]
            if available:
                r = _seeded_random(int(user.id), on_date, f"{seed_prefix}:{label}:cat:{category}")
                return r.choice(available)

        # Category empty; try any remaining from the preferred pool, then fallback.
        for label, by_cat in pools:
            all_items: list[dict[str, Any]] = []
            for items in by_cat.values():
                all_items.extend(items)
            available = [x for x in all_items if str(x.get("id") or "").strip() not in used_ids]
            if available:
                r = _seeded_random(int(user.id), on_date, f"{seed_prefix}:{label}:any")
                r.shuffle(available)
                return available[0]
        return None

    for slot_index, category in enumerate(slots):
        want_targeted = remaining_targeted > 0 and targeted_pool
        want_universal = remaining_universal > 0
        # Deterministic tie-breaker per slot when both are available.
        if want_targeted and want_universal:
            r = _seeded_random(int(user.id), on_date, f"slot_mix:{slot_index}:{category}")
            prefer = "targeted" if r.randint(0, 1) == 1 else "universal"
        elif want_targeted:
            prefer = "targeted"
        else:
            prefer = "universal"

        candidate = _pick_one(category=category, prefer=prefer, seed_prefix=f"slot:{slot_index}")
        if not candidate:
            continue
        cid = str(candidate.get("id") or "").strip()
        if not cid or cid in used_ids:
            continue
        used_ids.add(cid)
        picked.append(candidate)
        if prefer == "targeted" and remaining_targeted > 0 and _clean_profile_list(candidate.get("audience_profiles"), max_items=6):
            remaining_targeted -= 1
        elif remaining_universal > 0 and not _clean_profile_list(candidate.get("audience_profiles"), max_items=6):
            remaining_universal -= 1

    # Fill remaining slots from the full pool.
    if len(picked) < tasks_per_day:
        r = _seeded_random(int(user.id), on_date, "fill")
        remaining = [item for item in applicable if str(item.get("id") or "").strip() not in used_ids]
        r.shuffle(remaining)
        for item in remaining:
            picked.append(item)
            if len(picked) >= tasks_per_day:
                break

    out: list[dict[str, Any]] = []
    for item in picked[:tasks_per_day]:
        out.append(
            {
                "id": str(item.get("id") or "").strip(),
                "text": str(item.get("task_text") or "").strip(),
                "category": str(item.get("category") or "general").strip() or "general",
            }
        )
    return out


def _parse_json_list(value: str) -> list[Any]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except Exception:
        return []
    return data if isinstance(data, list) else []


def get_or_create_today(db: Session, *, user: User, on_date: date | None = None) -> UserDailyChallenge:
    day = _utc_today(on_date)
    row = (
        db.query(UserDailyChallenge)
        .filter(UserDailyChallenge.user_id == user.id, UserDailyChallenge.date == day)
        .first()
    )
    if row:
        return row

    tasks = _pick_tasks_for_day(db, user=user, on_date=day)
    row = UserDailyChallenge(
        user_id=int(user.id),
        date=day,
        tasks_json=json.dumps(tasks, ensure_ascii=False),
        completed_task_ids_json="[]",
        completed_at=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_challenge_view(db: Session, *, user: User, on_date: date | None = None) -> dict[str, Any]:
    row = get_or_create_today(db, user=user, on_date=on_date)
    tasks = _parse_json_list(row.tasks_json)
    completed_ids = set(str(x) for x in _parse_json_list(row.completed_task_ids_json) if isinstance(x, str))

    clean_tasks: list[dict[str, Any]] = []
    for item in tasks:
        if not isinstance(item, dict):
            continue
        tid = str(item.get("id") or "").strip()
        text = str(item.get("text") or "").strip()
        if not tid or not text:
            continue
        clean_tasks.append(
            {
                "id": tid,
                "text": text,
                "category": str(item.get("category") or "general").strip() or "general",
                "completed": tid in completed_ids,
            }
        )

    total = len(clean_tasks)
    completed_count = sum(1 for t in clean_tasks if t.get("completed"))
    completed_today = total > 0 and completed_count == total

    return {
        "date": row.date.isoformat(),
        "tasks": clean_tasks,
        "progress": {"completed": completed_count, "total": total},
        "completed_today": completed_today,
        "streak_days": get_streak_days(db, user=user, up_to=row.date),
    }


def set_task_completed(
    db: Session,
    *,
    user: User,
    task_id: str,
    completed: bool,
    force_undo: bool = False,
    on_date: date | None = None,
) -> dict[str, Any]:
    task_id = (task_id or "").strip()
    if not task_id:
        raise ValueError("task_id is required")

    row = get_or_create_today(db, user=user, on_date=on_date)
    tasks = _parse_json_list(row.tasks_json)
    allowed_ids = {str(t.get("id") or "").strip() for t in tasks if isinstance(t, dict)}
    if task_id not in allowed_ids:
        raise ValueError("task_id is not part of today's challenge")

    completed_ids = [x for x in _parse_json_list(row.completed_task_ids_json) if isinstance(x, str)]
    completed_set = set(completed_ids)
    if not completed:
        # Safety guard: if the user already completed today's challenge, require an explicit "force undo"
        # to avoid accidental taps that break completion and streak.
        total_ids = {x for x in allowed_ids if x}
        if total_ids and completed_set.issuperset(total_ids) and not bool(force_undo):
            raise ValueError("Challenge already completed today. Confirm undo to uncheck tasks.")
    if completed:
        completed_set.add(task_id)
    else:
        completed_set.discard(task_id)

    row.completed_task_ids_json = json.dumps(sorted(completed_set), ensure_ascii=False)
    # Mark completed_at only if all tasks are done.
    total_ids = {x for x in allowed_ids if x}
    if total_ids and completed_set.issuperset(total_ids):
        row.completed_at = datetime.utcnow()
    else:
        row.completed_at = None
    row.updated_at = datetime.utcnow()
    db.commit()
    return get_challenge_view(db, user=user, on_date=row.date)


def get_streak_days(db: Session, *, user: User, up_to: date | None = None, max_days: int = 60) -> int:
    end = _utc_today(up_to)
    max_days = max(1, min(int(max_days), 365))
    start = end.fromordinal(end.toordinal() - (max_days - 1))

    rows = (
        db.query(UserDailyChallenge)
        .filter(
            UserDailyChallenge.user_id == user.id,
            UserDailyChallenge.date >= start,
            UserDailyChallenge.date <= end,
        )
        .all()
    )
    by_date: dict[date, UserDailyChallenge] = {r.date: r for r in rows}

    streak = 0
    cur = end
    while True:
        row = by_date.get(cur)
        if not row:
            break
        tasks = _parse_json_list(row.tasks_json)
        task_ids = {str(t.get("id") or "").strip() for t in tasks if isinstance(t, dict)}
        task_ids = {x for x in task_ids if x}
        if not task_ids:
            break
        completed_ids = {str(x) for x in _parse_json_list(row.completed_task_ids_json) if isinstance(x, str)}
        if not task_ids.issubset(completed_ids):
            break
        streak += 1
        if streak >= max_days:
            break
        cur = cur.fromordinal(cur.toordinal() - 1)
    return streak

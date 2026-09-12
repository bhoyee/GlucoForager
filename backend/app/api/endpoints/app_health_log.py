import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.glucose_reading import GlucoseReading
from ...models.meal_log_entry import MealLogEntry
from ...models.user import User
from ...services.cache_service import CacheService
from ...services.diabetes_food_note import build_diabetes_note
from ...services.user_activity_service import add_user_activity
from ..dependencies import get_current_user

router = APIRouter(prefix="/app", tags=["app"])
logger = logging.getLogger(__name__)
cache = CacheService()

# A reading at/above this, within SPIKE_WINDOW of a logged meal, flags that meal as a
# likely trigger. 180 mg/dL 1-2h after eating is the standard ADA post-meal threshold -
# deliberately a fixed rule rather than a personalized/ML baseline for this first version.
SPIKE_THRESHOLD_MGDL = 180
SPIKE_WINDOW_MIN_MINUTES = 30
SPIKE_WINDOW_MAX_MINUTES = 180
LOG_HISTORY_DAYS = 14

# A second, independent check that doesn't depend on a nearby meal log at all - so a
# reading logged on its own (no meal, or outside the spike window) still gets real
# feedback instead of silently passing through unflagged. Standard ADA-referenced
# general alert bands, deliberately separate from the post-meal SPIKE_THRESHOLD_MGDL
# above (which specifically means "spiked after eating", not "high in general").
GENERAL_LOW_ALERT_MGDL = 70
GENERAL_HIGH_ALERT_MGDL = 250


def _general_alert(value_mg_dl: int) -> str | None:
    if value_mg_dl <= GENERAL_LOW_ALERT_MGDL:
        return "low"
    if value_mg_dl >= GENERAL_HIGH_ALERT_MGDL:
        return "high"
    return None

# Default daily carb target shown on the home screen ring when the user hasn't set
# their own. Matches the per-meal ceilings recipe_generation_service.py already flags
# recipes against (30g breakfast/snack, 35g lunch/dinner) summed across a normal day.
DEFAULT_DAILY_CARB_GOAL_G = 130

# General educational starting points by the diabetes type already collected at
# onboarding (blood_sugar_profile) - not medical advice, surfaced with a disclaimer
# client-side. Two types need different treatment, not just a different number:
#   - "gestational" guidance is usually a MINIMUM (eat at least this much), not a
#     ceiling, so the ring direction flips (goal_mode "floor" vs "ceiling").
#   - "type_1" has no single daily ceiling at all - management is per-meal carb
#     counting against insulin dosing, so we show the raw total with no target/verdict
#     (goal_mode "none") rather than a misleading pass/fail judgment.
CARB_GOAL_BY_PROFILE = {
    "type_2": 130,
    "prediabetes": 130,
    "gestational": 175,
    "managing": DEFAULT_DAILY_CARB_GOAL_G,
    "prefer_not": DEFAULT_DAILY_CARB_GOAL_G,
}


def _carb_goal_for_user(user: User) -> tuple[int | None, str]:
    """Returns (carb_goal_g, goal_mode) - goal_mode is "ceiling", "floor", or "none"."""
    if user.daily_carb_goal_g:
        return user.daily_carb_goal_g, "ceiling"
    if user.blood_sugar_profile == "type_1":
        return None, "none"
    if user.blood_sugar_profile == "gestational":
        return CARB_GOAL_BY_PROFILE["gestational"], "floor"
    return CARB_GOAL_BY_PROFILE.get(user.blood_sugar_profile, DEFAULT_DAILY_CARB_GOAL_G), "ceiling"

OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

# Meal/glucose logging has no AI cost, so this isn't about billing abuse the way the
# barcode/photo-scan limits are - it's a burst guard against a compromised or scripted
# client hammering these endpoints (e.g. a spam bot creating hundreds of junk rows a
# minute), not a limit anyone would hit from normal use.
LOG_RATE_LIMIT_PER_MINUTE = 20


def _enforce_log_rate_limit(user_id: int, kind: str) -> None:
    key = f"health_log:rl:v1:{kind}:user:{user_id}"
    if cache.incr(key, ttl_seconds=60) > LOG_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "Too many entries too fast - please slow down."},
        )


# Primary duplicate guard: a client-generated idempotency key (regenerated on the
# mobile side whenever the user actually edits a field, kept stable across a retry
# of the exact same tap). This is the correct fix for "double-tap / retry after a
# perceived timeout" - unlike a content+time-window guess, it can never confuse a
# genuine second reading/meal with a retry, no matter how close together in time,
# because it only matches an actual repeat of the same submission, not similar
# values. TTL just needs to outlast any realistic client retry delay.
IDEMPOTENCY_TTL_SECONDS = 300


def _idempotency_cache_key(kind: str, user_id: int, idempotency_key: str) -> str:
    return f"health_log:idem:v1:{kind}:user:{user_id}:{idempotency_key}"


# Fallback only, for a client that doesn't send an idempotency key (e.g. an older
# app build mid-rollout). Deliberately a tight window now that the key above is the
# real mechanism - this just catches a true near-simultaneous double-fire, not
# "logged the same number twice within a minute", which is well within normal use.
DUPLICATE_WINDOW_SECONDS = 5


def _recent_duplicate_glucose(
    db: Session, user_id: int, value_mg_dl: int, context: str | None
) -> GlucoseReading | None:
    since = datetime.utcnow() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)
    return (
        db.query(GlucoseReading)
        .filter(
            GlucoseReading.user_id == user_id,
            GlucoseReading.value_mg_dl == value_mg_dl,
            GlucoseReading.context == context,
            GlucoseReading.created_at >= since,
        )
        .order_by(GlucoseReading.created_at.desc())
        .first()
    )


def _recent_duplicate_meal(db: Session, user_id: int, description: str, source: str) -> MealLogEntry | None:
    since = datetime.utcnow() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)
    return (
        db.query(MealLogEntry)
        .filter(
            MealLogEntry.user_id == user_id,
            MealLogEntry.description == description,
            MealLogEntry.source == source,
            MealLogEntry.created_at >= since,
        )
        .order_by(MealLogEntry.created_at.desc())
        .first()
    )


class MealLogPayload(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    logged_at: datetime | None = None
    source: str = Field("manual", pattern="^(manual|barcode|photo)$")
    carbs_g: float | None = Field(None, ge=0, le=1000)
    calories: int | None = Field(None, ge=0, le=10000)
    idempotency_key: str | None = Field(None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")

    @field_validator("description")
    @classmethod
    def _description_must_have_letters(cls, value: str) -> str:
        # Cheap, non-AI guard: catches trivial junk (pure digits/symbols, e.g. "111"
        # or "!!!!") for free. Not real content moderation - real moderation would
        # need an AI call, which this free/instant endpoint deliberately doesn't make.
        cleaned = value.strip()
        if not any(ch.isalpha() for ch in cleaned):
            raise ValueError("Description must include some actual words, not just numbers or symbols.")
        return cleaned


GLUCOSE_CONTEXTS = ("fasting", "before_meal", "after_meal", "bedtime")


class GlucoseLogPayload(BaseModel):
    value_mg_dl: int = Field(..., ge=20, le=600)
    note: str | None = Field(None, max_length=200)
    context: str | None = Field(None, pattern="^(fasting|before_meal|after_meal|bedtime)$")
    logged_at: datetime | None = None
    idempotency_key: str | None = Field(None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")

    @field_validator("note")
    @classmethod
    def _note_must_have_letters_if_present(cls, value: str | None) -> str | None:
        # Same cheap guard as MealLogPayload.description, but note is optional - an
        # empty/blank note is fine, it just can't be non-empty junk like "111".
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        if not any(ch.isalpha() for ch in cleaned):
            raise ValueError("Note must include some actual words, not just numbers or symbols.")
        return cleaned


def _serialize_meal(meal: MealLogEntry) -> dict:
    return {
        "id": meal.id,
        "description": meal.description,
        "source": meal.source,
        "carbs_g": meal.carbs_g,
        "calories": meal.calories,
        "logged_at": meal.logged_at.isoformat(),
    }


def _serialize_reading(reading: GlucoseReading) -> dict:
    return {
        "id": reading.id,
        "value_mg_dl": reading.value_mg_dl,
        "note": reading.note,
        "context": reading.context,
        "logged_at": reading.logged_at.isoformat(),
    }


def _find_preceding_meal(db: Session, user_id: int, reading_time: datetime) -> MealLogEntry | None:
    window_start = reading_time - timedelta(minutes=SPIKE_WINDOW_MAX_MINUTES)
    window_end = reading_time - timedelta(minutes=SPIKE_WINDOW_MIN_MINUTES)
    return (
        db.query(MealLogEntry)
        .filter(
            MealLogEntry.user_id == user_id,
            MealLogEntry.logged_at >= window_start,
            MealLogEntry.logged_at <= window_end,
        )
        .order_by(MealLogEntry.logged_at.desc())
        .first()
    )


def _find_following_spike(db: Session, user_id: int, meal_time: datetime) -> GlucoseReading | None:
    window_start = meal_time + timedelta(minutes=SPIKE_WINDOW_MIN_MINUTES)
    window_end = meal_time + timedelta(minutes=SPIKE_WINDOW_MAX_MINUTES)
    return (
        db.query(GlucoseReading)
        .filter(
            GlucoseReading.user_id == user_id,
            GlucoseReading.value_mg_dl >= SPIKE_THRESHOLD_MGDL,
            GlucoseReading.logged_at >= window_start,
            GlucoseReading.logged_at <= window_end,
        )
        .order_by(GlucoseReading.logged_at.asc())
        .first()
    )


@router.post("/meals")
def log_meal(
    payload: MealLogPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_log_rate_limit(current_user.id, "meal")
    description = payload.description.strip()

    idem_key = (
        _idempotency_cache_key("meal", current_user.id, payload.idempotency_key)
        if payload.idempotency_key
        else None
    )
    if idem_key:
        cached_id = cache.get(idem_key)
        if cached_id:
            cached_meal = db.query(MealLogEntry).filter(MealLogEntry.id == int(cached_id)).first()
            if cached_meal:
                return {"meal": _serialize_meal(cached_meal), "duplicate": True}
    else:
        # No idempotency key from this client - fall back to the tight content+time
        # window guard so an old app build isn't left with zero duplicate protection.
        duplicate = _recent_duplicate_meal(db, current_user.id, description, payload.source)
        if duplicate:
            return {"meal": _serialize_meal(duplicate), "duplicate": True}

    logged_at = payload.logged_at or datetime.utcnow()
    meal = MealLogEntry(
        user_id=current_user.id,
        description=description,
        source=payload.source,
        carbs_g=payload.carbs_g,
        calories=payload.calories,
        logged_at=logged_at,
    )
    db.add(meal)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="meal_log.created",
        label="Logged a meal",
        source="mobile",
        metadata={"description": meal.description, "log_source": meal.source},
    )
    db.commit()
    db.refresh(meal)
    if idem_key:
        cache.set(idem_key, str(meal.id), ttl_seconds=IDEMPOTENCY_TTL_SECONDS)
    return {"meal": _serialize_meal(meal), "duplicate": False}


@router.get("/meals")
def list_meals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=LOG_HISTORY_DAYS)
    meals = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == current_user.id, MealLogEntry.logged_at >= since)
        .order_by(MealLogEntry.logged_at.desc())
        .limit(200)
        .all()
    )
    items = []
    for meal in meals:
        spike = _find_following_spike(db, current_user.id, meal.logged_at)
        entry = _serialize_meal(meal)
        entry["flagged_spike_mg_dl"] = spike.value_mg_dl if spike else None
        items.append(entry)
    return {"items": items}


@router.delete("/meals/{meal_id}")
def delete_meal(
    meal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meal = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.id == meal_id, MealLogEntry.user_id == current_user.id)
        .first()
    )
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    db.delete(meal)
    db.commit()
    return {"detail": "Deleted"}


def _glucose_response(db: Session, user_id: int, reading: GlucoseReading, *, duplicate: bool) -> dict:
    # A reading explicitly tagged "fasting" isn't a post-meal reading no matter what
    # the time-window heuristic would otherwise infer from a nearby meal log.
    preceding_meal = None if reading.context == "fasting" else _find_preceding_meal(db, user_id, reading.logged_at)
    is_spike = reading.value_mg_dl >= SPIKE_THRESHOLD_MGDL and preceding_meal is not None
    return {
        "reading": _serialize_reading(reading),
        "is_spike": is_spike,
        "flagged_meal": _serialize_meal(preceding_meal) if is_spike else None,
        "general_alert": _general_alert(reading.value_mg_dl),
        "duplicate": duplicate,
    }


@router.post("/glucose")
def log_glucose(
    payload: GlucoseLogPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_log_rate_limit(current_user.id, "glucose")

    idem_key = (
        _idempotency_cache_key("glucose", current_user.id, payload.idempotency_key)
        if payload.idempotency_key
        else None
    )
    if idem_key:
        cached_id = cache.get(idem_key)
        if cached_id:
            cached_reading = db.query(GlucoseReading).filter(GlucoseReading.id == int(cached_id)).first()
            if cached_reading:
                return _glucose_response(db, current_user.id, cached_reading, duplicate=True)
    else:
        # No idempotency key from this client - fall back to the tight content+time
        # window guard so an old app build isn't left with zero duplicate protection.
        duplicate = _recent_duplicate_glucose(db, current_user.id, payload.value_mg_dl, payload.context)
        if duplicate:
            return _glucose_response(db, current_user.id, duplicate, duplicate=True)

    logged_at = payload.logged_at or datetime.utcnow()
    reading = GlucoseReading(
        user_id=current_user.id,
        value_mg_dl=payload.value_mg_dl,
        note=(payload.note or "").strip() or None,
        context=payload.context,
        logged_at=logged_at,
    )
    db.add(reading)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="glucose_reading.created",
        label="Logged a glucose reading",
        source="mobile",
        metadata={"value_mg_dl": reading.value_mg_dl, "context": reading.context},
    )
    db.commit()
    db.refresh(reading)
    if idem_key:
        cache.set(idem_key, str(reading.id), ttl_seconds=IDEMPOTENCY_TTL_SECONDS)

    return _glucose_response(db, current_user.id, reading, duplicate=False)


@router.get("/glucose")
def list_glucose(
    days: int = Query(LOG_HISTORY_DAYS, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=days)
    readings = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == current_user.id, GlucoseReading.logged_at >= since)
        .order_by(GlucoseReading.logged_at.desc())
        .limit(1000)
        .all()
    )
    items = []
    for reading in readings:
        preceding_meal = (
            None if reading.context == "fasting" else _find_preceding_meal(db, current_user.id, reading.logged_at)
        )
        is_spike = reading.value_mg_dl >= SPIKE_THRESHOLD_MGDL and preceding_meal is not None
        entry = _serialize_reading(reading)
        entry["is_spike"] = is_spike
        entry["flagged_meal"] = _serialize_meal(preceding_meal) if is_spike else None
        entry["general_alert"] = _general_alert(reading.value_mg_dl)
        items.append(entry)
    return {"items": items}


@router.delete("/glucose/{reading_id}")
def delete_glucose_reading(
    reading_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reading = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.id == reading_id, GlucoseReading.user_id == current_user.id)
        .first()
    )
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    db.delete(reading)
    db.commit()
    return {"detail": "Deleted"}


@router.get("/health-log/today")
def get_today_health_log_summary(
    local_day_start: datetime | None = Query(
        None,
        description="Start of 'today' in the client's local timezone, as a UTC instant "
        "(e.g. local midnight converted to UTC). Falls back to UTC midnight if omitted.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # "Today" must mean the user's local calendar day, not the server's UTC day -
    # entries are stored with real UTC timestamps, but anchoring the boundary to UTC
    # midnight instead of the phone's local midnight silently drops or includes
    # entries near the day edge depending on the user's timezone.
    if local_day_start is not None and local_day_start.tzinfo is not None:
        # Stored logged_at values are naive UTC (datetime.utcnow()) - normalize to match,
        # since comparing an aware datetime against a naive column is unreliable.
        local_day_start = local_day_start.astimezone(timezone.utc).replace(tzinfo=None)
    today_start = local_day_start or datetime.combine(datetime.utcnow().date(), datetime.min.time())
    meals_today = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == current_user.id, MealLogEntry.logged_at >= today_start)
        .order_by(MealLogEntry.logged_at.desc())
        .all()
    )
    readings_today = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == current_user.id, GlucoseReading.logged_at >= today_start)
        .order_by(GlucoseReading.logged_at.desc())
        .all()
    )
    spikes_today = sum(
        1
        for r in readings_today
        if r.value_mg_dl >= SPIKE_THRESHOLD_MGDL
        and _find_preceding_meal(db, current_user.id, r.logged_at) is not None
    )
    carbs_logged_today = sum(m.carbs_g for m in meals_today if m.carbs_g is not None)
    carb_goal_g, carb_goal_mode = _carb_goal_for_user(current_user)
    return {
        "meals_logged_today": len(meals_today),
        "readings_logged_today": len(readings_today),
        "spikes_flagged_today": spikes_today,
        "carbs_logged_today_g": round(carbs_logged_today, 1) if carbs_logged_today else None,
        "carb_goal_g": carb_goal_g,
        "carb_goal_mode": carb_goal_mode,
        "last_reading": _serialize_reading(readings_today[0]) if readings_today else None,
    }


def _extract_nutrition(product: dict) -> dict:
    nutriments = product.get("nutriments") or {}

    def _num(*keys):
        for key in keys:
            value = nutriments.get(key)
            if isinstance(value, (int, float)):
                return float(value)
        return None

    has_serving = _num("carbohydrates_serving") is not None or _num("energy-kcal_serving") is not None
    suffix = "_serving" if has_serving else "_100g"
    basis = "serving" if has_serving else ("per_100g" if _num("carbohydrates_100g", "energy-kcal_100g") is not None else None)

    carbs = _num(f"carbohydrates{suffix}")
    calories = _num(f"energy-kcal{suffix}")
    sugars = _num(f"sugars{suffix}")
    fiber = _num(f"fiber{suffix}")
    net_carbs = carbs - fiber if carbs is not None and fiber is not None else None

    return {
        "carbs_g": round(carbs, 1) if carbs is not None else None,
        "calories": round(calories) if calories is not None else None,
        "sugars_g": round(sugars, 1) if sugars is not None else None,
        "fiber_g": round(fiber, 1) if fiber is not None else None,
        "net_carbs_g": round(net_carbs, 1) if net_carbs is not None else None,
        "basis": basis,
    }


def _diabetes_note(nutrition: dict, product: dict) -> dict:
    return build_diabetes_note(
        carbs_g=nutrition.get("carbs_g"),
        sugars_g=nutrition.get("sugars_g"),
        fiber_g=nutrition.get("fiber_g"),
        nova_group=product.get("nova_group"),
        nutriscore_grade=product.get("nutriscore_grade"),
    )


@router.get("/barcode/{barcode}")
def lookup_barcode(
    barcode: str,
    current_user: User = Depends(get_current_user),  # noqa: ARG001
):
    code = "".join(ch for ch in barcode if ch.isdigit())
    if not code:
        return {"found": False, "barcode": barcode}

    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(OPEN_FOOD_FACTS_URL.format(barcode=code))
    except Exception:
        logger.exception("Barcode lookup request failed for %s", code)
        return {"found": False, "barcode": code}

    if not response.is_success:
        return {"found": False, "barcode": code}

    data = response.json()
    if int(data.get("status") or 0) != 1 or not isinstance(data.get("product"), dict):
        return {"found": False, "barcode": code}

    product = data["product"]
    nutrition = _extract_nutrition(product)
    name = (product.get("product_name") or product.get("generic_name") or "").strip() or None

    return {
        "found": bool(name),
        "barcode": code,
        "name": name,
        "serving_size": product.get("serving_size"),
        **nutrition,
        "has_nutrition_data": nutrition.get("carbs_g") is not None,
        "diabetes_note": _diabetes_note(nutrition, product) if name else None,
    }

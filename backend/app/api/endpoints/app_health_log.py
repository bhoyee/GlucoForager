import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.glucose_reading import GlucoseReading
from ...models.favorite import Favorite
from ...models.meal_log_entry import MealLogEntry
from ...models.recipe_history import RecipeHistory
from ...models.user import User
from ...services.cache_service import CacheService
from ...services import glucose_insights, glucose_targets, meal_diary
from ...services.meal_carb_estimate import MODEL as MEAL_ESTIMATE_MODEL, estimate_meal_carbs
from ...services.diabetes_food_note import build_diabetes_note
from ...services import food_label, geo_country, glucose_impact
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


# Unlike the AI scan endpoints, barcode lookups have no AI/model cost - this is purely
# a burst/abuse guard (a scripted client hammering the endpoint, or accidentally
# proxying load onto Open Food Facts). The daily cap is generous - well above what
# anyone would hit shopping normally - to stay out of the way of real use.
BARCODE_RATE_LIMIT_PER_MINUTE = 30
BARCODE_DAILY_LIMIT = 200


def _enforce_barcode_rate_limit(user_id: int) -> None:
    minute_key = f"barcode:rl:v1:user:{user_id}"
    if cache.incr(minute_key, ttl_seconds=60) > BARCODE_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "Scanning too fast - wait a moment and try again."},
        )
    day_key = f"barcode:daily:v1:user:{user_id}:{datetime.utcnow().date().isoformat()}"
    if cache.incr(day_key, ttl_seconds=90000) > BARCODE_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "daily_limit",
                "message": f"You've reached today's {BARCODE_DAILY_LIMIT}-scan limit. Try again tomorrow.",
            },
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
    source: str = Field("manual", pattern="^(manual|barcode|photo|recipe)$")
    carbs_g: float | None = Field(None, ge=0, le=1000)
    calories: int | None = Field(None, ge=0, le=10000)
    carbs_estimated: bool = False
    food_name: str | None = Field(None, max_length=80)
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


def parse_iso_ts(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return 0.0


def _iso_utc(value: datetime | None) -> str | None:
    """logged_at is stored as a naive UTC datetime (datetime.utcnow()) - .isoformat() on
    that alone omits any timezone marker, which a mobile client's `new Date(...)`
    then parses as *device local* time instead of UTC, silently shifting every
    displayed time by the user's UTC offset. Mark it as UTC explicitly before
    serializing so clients convert to local time correctly."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _serialize_meal(meal: MealLogEntry) -> dict:
    return {
        "id": meal.id,
        "description": meal.description,
        "source": meal.source,
        "carbs_g": meal.carbs_g,
        "carbs_estimated": bool(getattr(meal, "carbs_estimated", False)),
        "food_name": getattr(meal, "food_name", None),
        "calories": meal.calories,
        "logged_at": _iso_utc(meal.logged_at),
    }


def _serialize_reading(reading: GlucoseReading) -> dict:
    return {
        "id": reading.id,
        "value_mg_dl": reading.value_mg_dl,
        "note": reading.note,
        "context": reading.context,
        "logged_at": _iso_utc(reading.logged_at),
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
        carbs_estimated=bool(payload.carbs_estimated and payload.carbs_g is not None),
        food_name=(payload.food_name or "").strip() or None,
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


class MealEstimatePayload(BaseModel):
    description: str = Field(..., min_length=2, max_length=200)


# Not counted against the free weekly AI uses: logging meals is the habit the app is
# built on. These limits only stop abuse; repeats are served from cache for free.
MEAL_ESTIMATE_PER_MINUTE = 20
MEAL_ESTIMATE_PER_DAY = 120


@router.post("/meals/estimate")
def estimate_meal(
    payload: MealEstimatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Carb estimate + standard food name for a typed meal. Never blocks logging:
    on failure the app just saves the meal without carbs."""
    if cache.incr(f"meal_estimate:rl:min:{current_user.id}", ttl_seconds=60) > MEAL_ESTIMATE_PER_MINUTE:
        raise HTTPException(status_code=429, detail={"code": "rate_limited", "message": "Slow down a little."})
    day_key = f"meal_estimate:rl:day:{current_user.id}:{datetime.utcnow().date().isoformat()}"
    if cache.incr(day_key, ttl_seconds=90000) > MEAL_ESTIMATE_PER_DAY:
        raise HTTPException(status_code=429, detail={"code": "daily_limit", "message": "Estimate limit reached for today."})
    result, from_cache = estimate_meal_carbs(payload.description)
    if result is None:
        raise HTTPException(status_code=503, detail={"code": "estimate_unavailable", "message": "No estimate right now."})
    if not from_cache:
        try:
            from ...services.cost_tracker import record_ai_request

            record_ai_request(db, current_user.id, "free", "meal_estimate", model_used=MEAL_ESTIMATE_MODEL)
        except Exception:  # noqa: BLE001 - tracking must never fail the estimate
            db.rollback()
    return result


@router.get("/meals/recent")
def recent_meals(
    limit: int = Query(6, ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Meals for one-tap re-logging, from the user's own log (last 60 days).
    "usual" = meals logged 2+ times (most often first); until there are any, the
    latest distinct meals are returned as "recent" so the label is always honest."""
    since = datetime.utcnow() - timedelta(days=60)
    meals = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == current_user.id, MealLogEntry.logged_at >= since)
        .order_by(MealLogEntry.logged_at.desc())
        .limit(300)
        .all()
    )
    groups: dict[str, dict] = {}
    for meal in meals:  # newest first, so the first one seen is the latest version
        key = (meal.food_name or meal.description or "").strip().lower()
        if not key:
            continue
        if key not in groups:
            groups[key] = {**_serialize_meal(meal), "times": 0}
        groups[key]["times"] += 1
    usual = [g for g in groups.values() if g["times"] >= 2]
    if usual:
        usual.sort(key=lambda g: (-g["times"], -parse_iso_ts(g["logged_at"] or "")))
        return {"label": "usual", "items": usual[:limit]}
    recent = list(groups.values())  # insertion order = newest first
    return {"label": "recent", "items": recent[: min(limit, 5)]}


def recipe_carbs_per_serving(recipe: dict) -> float | None:
    """Carbs per serving from a stored recipe, whichever shape it was saved in."""
    if not isinstance(recipe, dict):
        return None
    for block in ("nutritional_info", "nutrition", "nutrition_per_serving"):
        info = recipe.get(block)
        if not isinstance(info, dict):
            continue
        for field in ("carbs", "carbohydrates"):
            raw = info.get(field)
            try:
                value = float(str(raw).lower().replace("g", "").strip()) if raw is not None else None
            except ValueError:
                value = None
            if value is not None and 0 <= value <= 400:
                return round(value)
    return None


@router.get("/meals/recipe-options")
def recipe_meal_options(
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The user's favourite and recently generated recipes, with carbs per serving,
    so a cooked recipe can be logged as a meal with exact (not estimated) carbs."""
    options: list[dict] = []
    seen: set[str] = set()

    def add(title, recipe, origin):
        title = (title or "").strip()
        key = title.lower()
        if not title or key in seen:
            return
        seen.add(key)
        options.append({"title": title[:120], "carbs_g": recipe_carbs_per_serving(recipe), "origin": origin})

    favorites = (
        db.query(Favorite).filter(Favorite.user_id == current_user.id).order_by(Favorite.created_at.desc()).limit(20).all()
    )
    for fav in favorites:
        add(fav.title or (fav.recipe or {}).get("title"), fav.recipe or {}, "favorite")
    histories = (
        db.query(RecipeHistory)
        .filter(RecipeHistory.user_id == current_user.id)
        .order_by(RecipeHistory.created_at.desc())
        .limit(5)
        .all()
    )
    for history in histories:
        for recipe in history.recipes if isinstance(history.recipes, list) else []:
            if isinstance(recipe, dict):
                add(recipe.get("title") or recipe.get("name"), recipe, "recent")
    return {"items": options[:limit]}


class GlucoseImpactPayload(BaseModel):
    carbs_g: float | None = Field(None, ge=0, le=1000)
    fiber_g: float | None = Field(None, ge=0, le=200)
    protein_g: float | None = Field(None, ge=0, le=500)
    fat_g: float | None = Field(None, ge=0, le=500)
    sugars_g: float | None = Field(None, ge=0, le=1000)
    gi: float | None = Field(None, ge=0, le=110)
    is_drink: bool = False
    name: str | None = Field(None, max_length=200)


@router.post("/glucose-impact")
def glucose_impact_estimate(
    payload: GlucoseImpactPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Typical glucose impact for a recipe or meal, plus the user's own reading the last
    time they ate something with the same name. A fixed formula: no AI, no cost."""
    impact = glucose_impact.estimate_impact(
        carbs_g=payload.carbs_g, fiber_g=payload.fiber_g, protein_g=payload.protein_g,
        fat_g=payload.fat_g, sugars_g=payload.sugars_g, gi=payload.gi, is_drink=payload.is_drink,
    )
    return {
        "glucose_impact": impact,
        "last_time": glucose_impact.last_actual_reading(db, current_user, payload.name) if payload.name else None,
    }


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


def _glucose_response(db: Session, user_id: int, reading: GlucoseReading, *, duplicate: bool, targets=None) -> dict:
    # A reading explicitly tagged "fasting" isn't a post-meal reading no matter what
    # the time-window heuristic would otherwise infer from a nearby meal log.
    preceding_meal = None if reading.context == "fasting" else _find_preceding_meal(db, user_id, reading.logged_at)
    is_spike = reading.value_mg_dl >= SPIKE_THRESHOLD_MGDL and preceding_meal is not None
    # "Your reading after <meal> was on target": the same pairing the meal diary uses.
    paired = preceding_meal if reading.context not in ("fasting", "before_meal") else None
    return {
        "reading": _serialize_reading(reading),
        "is_spike": is_spike,
        "flagged_meal": _serialize_meal(preceding_meal) if is_spike else None,
        "general_alert": _general_alert(reading.value_mg_dl),
        "paired_meal": _serialize_meal(paired) if paired else None,
        "after_meal_result": (
            glucose_targets.classify(reading.value_mg_dl, "after_meal", targets or glucose_targets.GlucoseTargets())
            if paired
            else None
        ),
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
                return _glucose_response(db, current_user.id, cached_reading, duplicate=True, targets=glucose_targets.targets_for(current_user))
    else:
        # No idempotency key from this client - fall back to the tight content+time
        # window guard so an old app build isn't left with zero duplicate protection.
        duplicate = _recent_duplicate_glucose(db, current_user.id, payload.value_mg_dl, payload.context)
        if duplicate:
            return _glucose_response(db, current_user.id, duplicate, duplicate=True, targets=glucose_targets.targets_for(current_user))

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

    return _glucose_response(db, current_user.id, reading, duplicate=False, targets=glucose_targets.targets_for(current_user))


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
    # Judged against the user's own targets (same rules as Home and the meal diary).
    targets = glucose_targets.targets_for(current_user)
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
        entry.update(glucose_targets.classify(reading.value_mg_dl, reading.context, targets))
        items.append(entry)
    return {"items": items, "targets": targets.to_dict()}


@router.get("/health-log/diary")
def get_meal_diary(
    days: int = Query(LOG_HISTORY_DAYS, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Meals paired with their before/after readings, plus standalone readings, all
    judged against the user's own targets. Grouping into days happens on the phone
    (local time)."""
    since = datetime.utcnow() - timedelta(days=days)
    meals = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == current_user.id, MealLogEntry.logged_at >= since)
        .order_by(MealLogEntry.logged_at.desc())
        .limit(300)
        .all()
    )
    readings = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == current_user.id, GlucoseReading.logged_at >= since)
        .order_by(GlucoseReading.logged_at.desc())
        .limit(1000)
        .all()
    )
    targets = glucose_targets.targets_for(current_user)
    items = meal_diary.build_diary(meals, readings, targets, _serialize_meal, _serialize_reading)
    return {"days": days, "targets": targets.to_dict(), "items": items}


@router.get("/health-log/insights")
def get_glucose_insights(
    days: int = Query(30, ge=7, le=90),
    tz_offset_minutes: int = Query(0, ge=-840, le=840, description="Phone's offset from UTC, minutes east"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Glucose insights (Trends / Food impact / Patterns) and the one highlight for Home.
    Rules only, from the user's own data - see services/glucose_insights.py."""
    now = datetime.utcnow()
    since = now - timedelta(days=days)
    meals = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == current_user.id, MealLogEntry.logged_at >= since)
        .limit(1000)
        .all()
    )
    readings = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == current_user.id, GlucoseReading.logged_at >= since - timedelta(days=days))
        .limit(5000)
        .all()
    )
    current = [r for r in readings if r.logged_at >= since]
    previous = [r for r in readings if r.logged_at < since]
    targets = glucose_targets.targets_for(current_user)
    carb_goal_g, goal_mode = _carb_goal_for_user(current_user)
    return glucose_insights.build_insights(
        meals, current, previous, targets, days, tz_offset_minutes, carb_goal_g=carb_goal_g, goal_mode=goal_mode
    )


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
    glucose = _glucose_summary(db, current_user, readings_today)
    return {
        "meals_logged_today": len(meals_today),
        "readings_logged_today": len(readings_today),
        "spikes_flagged_today": spikes_today,
        "carbs_logged_today_g": round(carbs_logged_today, 1) if carbs_logged_today else None,
        "carb_goal_g": carb_goal_g,
        "carb_goal_mode": carb_goal_mode,
        "last_reading": _serialize_reading(readings_today[0]) if readings_today else None,
        "glucose": glucose,
    }


def _in_range_stats(readings: list[GlucoseReading], targets) -> dict:
    counts = {k: 0 for k in ("in_range", "above", "below", "low", "very_high")}
    for r in readings:
        counts[glucose_targets.classify(r.value_mg_dl, r.context, targets)["status"]] += 1
    total = len(readings)
    return {
        "readings": total,
        **counts,
        "in_range_pct": round(100 * counts["in_range"] / total) if total else None,
    }


def _glucose_summary(db: Session, user: User, readings_today: list[GlucoseReading]) -> dict:
    """Home "Track today" glucose block: today's readings vs target, the latest reading's
    status, and this week vs last week (rolling 7-day windows) to show progress."""
    targets = glucose_targets.targets_for(user)
    now = datetime.utcnow()
    last_14 = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == user.id, GlucoseReading.logged_at >= now - timedelta(days=14))
        .all()
    )
    week_cut = now - timedelta(days=7)
    this_week = [r for r in last_14 if r.logged_at >= week_cut]
    prev_week = [r for r in last_14 if r.logged_at < week_cut]
    last = None
    if readings_today:
        latest = readings_today[0]
        last = {**_serialize_reading(latest), **glucose_targets.classify(latest.value_mg_dl, latest.context, targets)}
    return {
        "today": _in_range_stats(readings_today, targets),
        "last": last,
        "week": _in_range_stats(this_week, targets),
        "prev_week": _in_range_stats(prev_week, targets),
        "targets": targets.to_dict(),
    }


class GlucoseTargetsPayload(BaseModel):
    premeal_low: int = Field(..., ge=40, le=300)
    premeal_high: int = Field(..., ge=40, le=300)
    postmeal_high: int = Field(..., ge=40, le=400)


@router.get("/health-log/glucose-targets")
def get_glucose_targets(current_user: User = Depends(get_current_user)):
    return glucose_targets.targets_for(current_user).to_dict()


@router.put("/health-log/glucose-targets")
def put_glucose_targets(
    payload: GlucoseTargetsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    error = glucose_targets.validate_targets(payload.premeal_low, payload.premeal_high, payload.postmeal_high)
    if error:
        raise HTTPException(status_code=422, detail={"code": "invalid_targets", "message": error})
    current_user.glucose_target_premeal_low_mgdl = payload.premeal_low
    current_user.glucose_target_premeal_high_mgdl = payload.premeal_high
    current_user.glucose_target_postmeal_high_mgdl = payload.postmeal_high
    db.add(current_user)
    db.commit()
    return glucose_targets.targets_for(current_user).to_dict()


@router.delete("/health-log/glucose-targets")
def reset_glucose_targets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Back to the ADA defaults."""
    current_user.glucose_target_premeal_low_mgdl = None
    current_user.glucose_target_premeal_high_mgdl = None
    current_user.glucose_target_postmeal_high_mgdl = None
    db.add(current_user)
    db.commit()
    return glucose_targets.targets_for(current_user).to_dict()


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enforce_barcode_rate_limit(current_user.id)

    code = "".join(ch for ch in barcode if ch.isdigit())
    if not code:
        return {"found": False, "barcode": barcode}
    result = _lookup_barcode_product(code)
    if result.get("found"):
        # Ratings in the user's own country's standard (FDA %DV in the US, etc.).
        ratings = food_label.nutrient_ratings(
            result.get("per_100g") or {}, result.get("per_serving"), bool(result.get("is_drink")),
            geo_country.effective_country(current_user)[0], result.get("serving_quantity"),
        )
        result["traffic_lights"] = ratings["lights"]
        result["traffic_light_standard"] = ratings["standard"]
        result["rating_system"] = ratings["system"]
        result["rating_country"] = geo_country.effective_country(current_user)[0]
        # Carbs in one serving vs a typical meal for this user's daily carb goal.
        carb_goal_g, goal_mode = _carb_goal_for_user(current_user)
        per_serving = result.get("per_serving") or {}
        result["meal_share"] = food_label.meal_share(per_serving.get("carbs_g"), carb_goal_g, goal_mode)
        result["insights"] = food_label.build_insights(
            per_serving=per_serving,
            per_100g=result.get("per_100g") or {},
            lights=result.get("traffic_lights") or [],
            fibre=result.get("fibre_claim"),
            nova_group=(result.get("diabetes_note") or {}).get("nova_group"),
            share=result["meal_share"],
            serving_size=result.get("serving_size"),
            drink=bool(result.get("is_drink")),
        )
        # Typical 2-hour response for one serving (per 100g/ml when no serving size).
        basis = per_serving if (per_serving and per_serving.get("carbs_g") is not None) else (result.get("per_100g") or {})
        impact = glucose_impact.estimate_impact(
            carbs_g=basis.get("carbs_g"), fiber_g=basis.get("fiber_g"), protein_g=basis.get("protein_g"),
            fat_g=basis.get("fat_g"), sugars_g=basis.get("sugars_g"), is_drink=bool(result.get("is_drink")),
        )
        if impact:
            impact["portion"] = "per serving" if basis is per_serving else ("per 100ml" if result.get("is_drink") else "per 100g")
        result["glucose_impact"] = impact
        result["last_time"] = glucose_impact.last_actual_reading(db, current_user, result.get("name"))
    # Feature-usage tracking (admin Activity chart). Never fail the lookup over it.
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="barcode.scanned",
        label="Scanned a barcode",
        source="mobile",
        metadata={"found": bool(result.get("found"))},
        commit=True,
    )
    return result


def _lookup_barcode_product(code: str) -> dict:

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
    nutriments = product.get("nutriments") or {}
    per_100g = food_label.nutrient_table(nutriments, "_100g")
    per_serving = food_label.nutrient_table(nutriments, "_serving")
    drink = food_label.is_drink(product)

    return {
        "found": bool(name),
        "barcode": code,
        "name": name,
        "brand": (product.get("brands") or "").split(",")[0].strip() or None,
        "image_url": product.get("image_front_small_url") or product.get("image_small_url") or product.get("image_url"),
        "serving_size": product.get("serving_size"),
        **nutrition,
        "has_nutrition_data": nutrition.get("carbs_g") is not None,
        "diabetes_note": _diabetes_note(nutrition, product) if name else None,
        # Full label: per 100g (what the traffic lights use) and per serving when known.
        "per_100g": per_100g,
        "per_serving": per_serving if any(v is not None for v in per_serving.values()) else None,
        "is_drink": drink,
        "serving_quantity": product.get("serving_quantity") if isinstance(product.get("serving_quantity"), (int, float)) else None,
        "traffic_lights": food_label.traffic_lights(
            per_100g, drink, per_serving, product.get("serving_quantity") if isinstance(product.get("serving_quantity"), (int, float)) else None
        ),
        "traffic_light_standard": "UK FSA front-of-pack, per 100ml" if drink else "UK FSA front-of-pack, per 100g",
        "fibre_claim": food_label.fibre_claim(per_100g),
        "nova_group": product.get("nova_group"),
        "nova_label": food_label.NOVA_LABELS.get(int(product["nova_group"])) if isinstance(product.get("nova_group"), (int, float)) else None,
        "nutriscore_grade": (product.get("nutriscore_grade") or "").lower() or None,
    }

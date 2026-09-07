import logging
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.glucose_reading import GlucoseReading
from ...models.meal_log_entry import MealLogEntry
from ...models.user import User
from ...services.user_activity_service import add_user_activity
from ..dependencies import get_current_user

router = APIRouter(prefix="/app", tags=["app"])
logger = logging.getLogger(__name__)

# A reading at/above this, within SPIKE_WINDOW of a logged meal, flags that meal as a
# likely trigger. 180 mg/dL 1-2h after eating is the standard ADA post-meal threshold -
# deliberately a fixed rule rather than a personalized/ML baseline for this first version.
SPIKE_THRESHOLD_MGDL = 180
SPIKE_WINDOW_MIN_MINUTES = 30
SPIKE_WINDOW_MAX_MINUTES = 180
LOG_HISTORY_DAYS = 14

OPEN_FOOD_FACTS_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"


class MealLogPayload(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    logged_at: datetime | None = None
    source: str = Field("manual", pattern="^(manual|barcode|photo)$")
    carbs_g: float | None = Field(None, ge=0, le=1000)
    calories: int | None = Field(None, ge=0, le=10000)


class GlucoseLogPayload(BaseModel):
    value_mg_dl: int = Field(..., ge=20, le=600)
    note: str | None = Field(None, max_length=200)
    logged_at: datetime | None = None


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
    logged_at = payload.logged_at or datetime.utcnow()
    meal = MealLogEntry(
        user_id=current_user.id,
        description=payload.description.strip(),
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
    return {"meal": _serialize_meal(meal)}


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


@router.post("/glucose")
def log_glucose(
    payload: GlucoseLogPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logged_at = payload.logged_at or datetime.utcnow()
    reading = GlucoseReading(
        user_id=current_user.id,
        value_mg_dl=payload.value_mg_dl,
        note=(payload.note or "").strip() or None,
        logged_at=logged_at,
    )
    db.add(reading)
    add_user_activity(
        db,
        user_id=current_user.id,
        event_type="glucose_reading.created",
        label="Logged a glucose reading",
        source="mobile",
        metadata={"value_mg_dl": reading.value_mg_dl},
    )
    db.commit()
    db.refresh(reading)

    preceding_meal = _find_preceding_meal(db, current_user.id, logged_at)
    is_spike = reading.value_mg_dl >= SPIKE_THRESHOLD_MGDL and preceding_meal is not None

    return {
        "reading": _serialize_reading(reading),
        "is_spike": is_spike,
        "flagged_meal": _serialize_meal(preceding_meal) if is_spike else None,
    }


@router.get("/glucose")
def list_glucose(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    since = datetime.utcnow() - timedelta(days=LOG_HISTORY_DAYS)
    readings = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == current_user.id, GlucoseReading.logged_at >= since)
        .order_by(GlucoseReading.logged_at.desc())
        .limit(200)
        .all()
    )
    items = []
    for reading in readings:
        preceding_meal = _find_preceding_meal(db, current_user.id, reading.logged_at)
        is_spike = reading.value_mg_dl >= SPIKE_THRESHOLD_MGDL and preceding_meal is not None
        entry = _serialize_reading(reading)
        entry["is_spike"] = is_spike
        entry["flagged_meal"] = _serialize_meal(preceding_meal) if is_spike else None
        items.append(entry)
    return {"items": items}


@router.get("/health-log/today")
def get_today_health_log_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_start = datetime.combine(datetime.utcnow().date(), datetime.min.time())
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
    return {
        "meals_logged_today": len(meals_today),
        "readings_logged_today": len(readings_today),
        "spikes_flagged_today": spikes_today,
        "carbs_logged_today_g": round(carbs_logged_today, 1) if carbs_logged_today else None,
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


# Sugar per serving/100g at or above this is flagged "high sugar" - a commonly used
# nutrition-label rule of thumb, not a personalized threshold.
HIGH_SUGAR_THRESHOLD_G = 10
# Ultra-processed on the NOVA classification (1=unprocessed, 4=ultra-processed).
ULTRA_PROCESSED_NOVA_GROUP = 4
# Meaningful carb load with very little fiber to slow absorption.
LOW_FIBER_CARB_THRESHOLD_G = 15
LOW_FIBER_THRESHOLD_G = 2


def _diabetes_note(nutrition: dict, product: dict) -> dict:
    """Rule-based, transparent flags - not a medical verdict. Mirrors the same
    "simple rule, not ML" approach as the glucose spike threshold: named, fixed
    signals a viewer can see and judge for themselves, rather than an opaque score."""
    flags: list[str] = []

    sugars = nutrition.get("sugars_g")
    if sugars is not None and sugars >= HIGH_SUGAR_THRESHOLD_G:
        flags.append("High in sugar")

    nova_group = product.get("nova_group")
    if isinstance(nova_group, (int, float)) and int(nova_group) == ULTRA_PROCESSED_NOVA_GROUP:
        flags.append("Highly processed")

    carbs = nutrition.get("carbs_g")
    fiber = nutrition.get("fiber_g")
    if carbs is not None and carbs >= LOW_FIBER_CARB_THRESHOLD_G and (fiber is None or fiber < LOW_FIBER_THRESHOLD_G):
        flags.append("Low fiber for its carbs")

    if len(flags) == 0:
        verdict = "good_fit"
    elif len(flags) == 1:
        verdict = "moderate"
    else:
        verdict = "use_caution"

    return {"verdict": verdict, "flags": flags, "nova_group": nova_group, "nutriscore_grade": product.get("nutriscore_grade")}


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
        "diabetes_note": _diabetes_note(nutrition, product) if name else None,
    }

"""Estimated glucose impact: a TYPICAL 2-hour response shape for a food or meal.

Deliberately not a personal prediction (that would need the person's own data, and a
precise personal number would be a medical-device claim). Built from:
- Glycaemic load (GL) = available carbs x GI / 100, banded with the standard cut-offs
  (low <= 10, medium 11-19, high >= 20) -> Gentle / Moderate / Sharp.
- GI from the source when known, otherwise estimated from the nutrient mix.
- Timing: sugars and drinks peak sooner; fibre, protein and fat slow absorption.
The curve is relative (no mg/dL), so the app shows bands, not a number. The personal
part is the user's OWN logged reading after a similar meal (see last_actual_reading).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from . import glucose_targets
from .glucose_insights import food_key
from .meal_diary import build_diary

CURVE_MINUTES = list(range(0, 125, 5))
GL_FOR_FULL_SCALE = 30.0  # GL 10 -> 0.33 (top of gentle), GL 20 -> 0.67 (top of moderate)


def _num(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def estimate_gi(*, carbs: float, sugars: float | None, fibre: float | None, protein: float | None,
                fat: float | None, drink: bool) -> int:
    """Rough GI when the source has none: a mixed-meal baseline nudged by the nutrient mix."""
    gi = 55.0
    if carbs > 0 and sugars is not None:
        share = sugars / carbs
        if share > 0.5:
            gi += 10
        elif share < 0.15:
            gi += 3  # mostly starch: refined starches are often fairly high GI
    if carbs > 0 and fibre is not None and fibre / carbs >= 0.1:
        gi -= 10
    if (protein or 0) + (fat or 0) >= carbs and carbs > 0:
        gi -= 8
    if drink:
        gi += 8
    return int(max(25, min(95, round(gi))))


def estimate_impact(*, carbs_g, fiber_g=None, protein_g=None, fat_g=None, sugars_g=None,
                    gi=None, is_drink: bool = False) -> dict | None:
    carbs = _num(carbs_g)
    if carbs is None:
        return None
    fibre, protein, fat, sugars = _num(fiber_g), _num(protein_g), _num(fat_g), _num(sugars_g)
    available = max(0.0, carbs - (fibre or 0.0))
    gi_value = _num(gi)
    gi_source = "provided" if gi_value is not None else "estimated"
    if gi_value is None:
        gi_value = estimate_gi(carbs=carbs, sugars=sugars, fibre=fibre, protein=protein, fat=fat, drink=is_drink)
    gl = available * gi_value / 100.0

    if gl <= 10:
        impact, label = "gentle", "Gentle rise"
    elif gl < 20:
        impact, label = "moderate", "Moderate rise"
    else:
        impact, label = "sharp", "Sharp rise"

    # Timing and shape.
    peak = 40.0
    factors: list[str] = []
    sugar_share = (sugars / carbs) if (sugars is not None and carbs > 0) else None
    if is_drink:
        peak -= 10
        factors.append("Drinks are absorbed quickly")
    if sugar_share is not None and sugar_share > 0.5:
        peak -= 8
        factors.append("Mostly sugar, so it peaks early")
    if fibre is not None and fibre >= 5:
        peak += 10
        factors.append("Fibre slows the rise")
    if (protein or 0) + (fat or 0) >= 20:
        peak += 10
        factors.append("Protein and fat slow absorption")
    if fat is not None and fat >= 15:
        peak += 5
    peak = max(25.0, min(75.0, peak))
    # Lower k = wider curve with a longer tail (mixed, slower meals).
    k = 2.2 if peak <= 35 else 1.8 if peak <= 50 else 1.4

    amplitude = min(gl / GL_FOR_FULL_SCALE, 1.25)
    points = []
    for t in CURVE_MINUTES:
        x = t / peak
        v = 0.0 if t == 0 else amplitude * (x ** k) * math.exp(k * (1 - x))
        points.append([t, round(v, 3)])

    lo = int(max(15, peak - 10) // 5 * 5)
    hi = int(min(120, peak + 15) // 5 * 5)
    if not factors and gl > 10:
        factors.append("Little fibre, protein or fat to slow it")
    if available < 5:
        factors = ["Very few carbs, so little effect on blood sugar"]

    # Where it typically is at the 2-hour check (when people test, and when our reminder fires).
    at_two_hours = points[-1][1]
    share = (at_two_hours / amplitude) if amplitude > 0 else 0
    if available < 5 or amplitude < 0.12:
        two_hour = {"level": "baseline", "text": "Little change by 2 hours"}
    elif share < 0.3:
        two_hour = {"level": "baseline", "text": "Mostly back down by 2 hours"}
    elif share < 0.6:
        two_hour = {"level": "falling", "text": "Coming down by 2 hours"}
    else:
        two_hour = {"level": "raised", "text": "Still raised at 2 hours"}

    return {
        "impact": impact,
        "label": label,
        "two_hour": two_hour,
        "glycemic_load": round(gl, 1),
        "gi": int(round(gi_value)),
        "gi_source": gi_source,
        "peak_minutes": int(round(peak)),
        "peak_window": f"{lo}-{hi} min",
        "points": points,
        "relative_peak": round(amplitude, 3),
        "factors": factors[:3],
        "basis": "typical",
    }


def last_actual_reading(db, user, name: str | None, *, days: int = 90) -> dict | None:
    """The user's own reading 30 min-3 h after the last time they ate something with the
    same name (same pairing rules as the meal diary). Real data, not a prediction."""
    key = food_key(name or "")
    if not key:
        return None
    from ..models.glucose_reading import GlucoseReading
    from ..models.meal_log_entry import MealLogEntry

    since = datetime.utcnow() - timedelta(days=days)
    meals = (
        db.query(MealLogEntry)
        .filter(MealLogEntry.user_id == user.id, MealLogEntry.logged_at >= since)
        .order_by(MealLogEntry.logged_at.desc())
        .limit(500)
        .all()
    )
    matching = [m for m in meals if key in {food_key(m.food_name or ""), food_key(m.description or "")}]
    if not matching:
        return None
    readings = (
        db.query(GlucoseReading)
        .filter(GlucoseReading.user_id == user.id, GlucoseReading.logged_at >= since)
        .limit(2000)
        .all()
    )
    keep = lambda o: {k: getattr(o, k) for k in ("id", "description", "value_mg_dl", "context", "logged_at") if hasattr(o, k)}  # noqa: E731
    targets = glucose_targets.targets_for(user)
    ids = {m.id for m in matching}
    for item in build_diary(meals, readings, targets, keep, keep):
        if item["kind"] == "meal" and item["id"] in ids and item["after"]:
            after = item["after"]
            return {
                "value_mg_dl": after["value_mg_dl"],
                "minutes_after": int((after["logged_at"] - item["logged_at"]).total_seconds() // 60),
                "status": after["status"],
                "delta_mg_dl": after["delta_mg_dl"],
                "when": item["logged_at"].isoformat() + "Z",
                "meal": item.get("description"),
            }
    return None

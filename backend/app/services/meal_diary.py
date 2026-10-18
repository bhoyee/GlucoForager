"""Meal diary: pairs each logged meal with the glucose readings around it, so the app
can show "this meal -> this reading" instead of two unrelated lists.

Rules (logging is often patchy, so every rule tolerates gaps):
- After reading: 30 min - 3 h after the meal. A reading belongs to the most recent meal
  before it (two meals close together -> the later one). If a meal has several, the one
  closest to the 2 h mark is used. Readings tagged fasting/before_meal are never "after".
- Before reading: up to 60 min before the meal, not already used as an after reading,
  and not tagged after_meal. Shows the rise ("110 before -> 165 after").
- Everything else is listed on its own, still judged against the user's targets.
"""

from __future__ import annotations

from datetime import timedelta

from . import glucose_targets

AFTER_MIN = timedelta(minutes=30)
AFTER_MAX = timedelta(hours=3)
AFTER_IDEAL = timedelta(hours=2)
BEFORE_MAX = timedelta(minutes=60)
NOT_AFTER_CONTEXTS = {"fasting", "before_meal"}


def _judged(reading, context, targets, serialize_reading) -> dict:
    return {
        **serialize_reading(reading),
        **glucose_targets.classify(reading.value_mg_dl, context, targets),
    }


def build_diary(meals, readings, targets, serialize_meal, serialize_reading) -> list[dict]:
    """meals/readings: ORM rows (any order). Returns diary items, newest first."""
    meals = sorted(meals, key=lambda m: m.logged_at)
    readings = sorted(readings, key=lambda r: r.logged_at)

    # After readings: each candidate reading -> latest meal in its window.
    after_candidates: dict[int, list] = {}
    for r in readings:
        if r.context in NOT_AFTER_CONTEXTS:
            continue
        owner = None
        for m in meals:
            gap = r.logged_at - m.logged_at
            if AFTER_MIN <= gap <= AFTER_MAX:
                owner = m  # meals are ascending, so the last match is the latest meal
        if owner is not None:
            after_candidates.setdefault(owner.id, []).append(r)

    after_for: dict[int, object] = {}
    used: set[int] = set()
    for meal_id, cands in after_candidates.items():
        meal = next(m for m in meals if m.id == meal_id)
        best = min(cands, key=lambda r: abs((r.logged_at - meal.logged_at) - AFTER_IDEAL))
        after_for[meal_id] = best
        used.add(best.id)

    # Before readings: nearest unused reading in the hour before the meal.
    before_for: dict[int, object] = {}
    for m in meals:
        cands = [
            r
            for r in readings
            if r.id not in used
            and r.context != "after_meal"
            and timedelta(0) <= m.logged_at - r.logged_at <= BEFORE_MAX
        ]
        if cands:
            best = max(cands, key=lambda r: r.logged_at)
            before_for[m.id] = best
            used.add(best.id)

    items: list[tuple] = []
    for m in meals:
        after = after_for.get(m.id)
        before = before_for.get(m.id)
        entry = {"kind": "meal", **serialize_meal(m)}
        # A reading 30 min - 3 h after eating is judged as post-meal whatever it was tagged.
        entry["after"] = _judged(after, "after_meal", targets, serialize_reading) if after else None
        entry["before"] = (
            _judged(before, before.context or "before_meal", targets, serialize_reading) if before else None
        )
        entry["rise_mg_dl"] = after.value_mg_dl - before.value_mg_dl if after and before else None
        items.append((m.logged_at, entry))

    for r in readings:
        if r.id in used:
            continue
        items.append((r.logged_at, {"kind": "glucose", **_judged(r, r.context, targets, serialize_reading)}))

    items.sort(key=lambda pair: pair[0], reverse=True)
    return [entry for _, entry in items]

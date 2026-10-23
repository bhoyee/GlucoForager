"""Daily challenge tasks that tick themselves, and a shortcut for each task.

Each catalogue task is matched (by its wording) to:
- auto:   something the app already records that proves it was done (a glucose reading after a
          meal, a meal logged with carbs, a recipe cooked, tomorrow's meal plan...). When that has
          happened today, the task is completed for the user - no tapping needed.
- action: the screen that helps do it ("Log glucose", "Find a swap", "Scan a label"...).
Tasks with neither (water, walks) stay one-tap ticks.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from ..models.glucose_reading import GlucoseReading
from ..models.meal_log_entry import MealLogEntry

ACTIONS = {
    "log_glucose": {"label": "Log glucose", "screen": "LogGlucose"},
    "log_meal": {"label": "Log a meal", "screen": "LogMeal"},
    "find_recipe": {"label": "Find a recipe", "screen": "ManualInput"},
    "plan_meals": {"label": "Open meal planner", "screen": "DailyPlan"},
    "scan_label": {"label": "Scan a label", "screen": "BarcodeScan"},
    "find_swap": {"label": "Find a swap", "screen": "CarbSwaps"},
    "insights": {"label": "See my insights", "screen": "GlucoseInsights"},
}

AUTO_HINTS = {
    "glucose_after_meal": "Ticks itself when you log a reading after a meal",
    "glucose_morning": "Ticks itself when you log a morning (fasting) reading",
    "glucose_bedtime": "Ticks itself when you log a bedtime reading",
    "glucose_any": "Ticks itself when you log a glucose reading",
    "meal_with_carbs": "Ticks itself when you log a meal with its carbs",
    "cooked_recipe": "Ticks itself when you tap \"I ate this\" on a recipe",
    "plan_tomorrow": "Ticks itself when tomorrow has a meal plan",
}

# (pattern, auto trigger or None, action key or None) - first match wins.
RULES: list[tuple[re.Pattern, str | None, str | None]] = [
    (re.compile(r"glucose.*(after|1-2 hours|2 hours).*(meal|lunch|dinner|eating|snack|dessert)|glucose changed after", re.I), "glucose_after_meal", "log_glucose"),
    (re.compile(r"morning glucose|glucose.*morning", re.I), "glucose_morning", "log_glucose"),
    (re.compile(r"glucose.*(bed|sleep)", re.I), "glucose_bedtime", "log_glucose"),
    (re.compile(r"\bcheck (your )?glucose\b", re.I), "glucose_any", "log_glucose"),
    (re.compile(r"estimate carbs|look up (the )?carb|plan carbs|carb count", re.I), "meal_with_carbs", "log_meal"),
    (re.compile(r"cook (one|a)? ?(simple )?meal at home", re.I), "cooked_recipe", "find_recipe"),
    (re.compile(r"\bplan\b.*tomorrow|plan one meal ahead", re.I), "plan_tomorrow", "plan_meals"),
    (re.compile(r"label|serving size|added sugar|sugar in sauces", re.I), None, "scan_label"),
    (re.compile(r"instead of|replace|swap|grilled or baked|choose fruit", re.I), None, "find_swap"),
    (re.compile(r"pattern|notice how", re.I), None, "insights"),
    (re.compile(r"\b(meals?|breakfast|lunch|dinner|plates?|vegetables?|veg|protein|portions?|carbs?|snacks?|salad|beans|lentils|greens|fib(er|re)|eggs?|yogh?urt|oatmeal|second serving)\b", re.I), None, "log_meal"),
]


def classify(text: str) -> dict:
    for pattern, auto, action in RULES:
        if pattern.search(text or ""):
            return {"auto": auto, "action": ACTIONS.get(action) if action else None}
    return {"auto": None, "action": None}


def todays_facts(db: Session, user_id: int, day: date, *, has_plan_tomorrow=None) -> set[str]:
    """Which auto triggers have already happened on this (UTC) challenge day."""
    start = datetime.combine(day, time.min)
    end = start + timedelta(days=1)
    readings = (
        db.query(GlucoseReading.logged_at, GlucoseReading.context)
        .filter(GlucoseReading.user_id == user_id, GlucoseReading.logged_at >= start, GlucoseReading.logged_at < end)
        .all()
    )
    meals = (
        db.query(MealLogEntry.logged_at, MealLogEntry.carbs_g, MealLogEntry.source)
        .filter(MealLogEntry.user_id == user_id, MealLogEntry.logged_at >= start - timedelta(hours=3), MealLogEntry.logged_at < end)
        .all()
    )
    facts: set[str] = set()
    if readings:
        facts.add("glucose_any")
    for logged_at, context in readings:
        if context == "fasting":
            facts.add("glucose_morning")
        if context == "bedtime":
            facts.add("glucose_bedtime")
        if context == "after_meal" or any(
            timedelta(minutes=30) <= logged_at - m_at <= timedelta(hours=3) for m_at, _c, _s in meals
        ):
            facts.add("glucose_after_meal")
    today_meals = [m for m in meals if m[0] >= start]
    if any(c is not None for _a, c, _s in today_meals):
        facts.add("meal_with_carbs")
    if any(s == "recipe" for _a, _c, s in today_meals):
        facts.add("cooked_recipe")
    if has_plan_tomorrow and has_plan_tomorrow():
        facts.add("plan_tomorrow")
    return facts


def plan_tomorrow_checker(db: Session, user_id: int, day: date):
    def check() -> bool:
        try:
            from ..models.meal_plan import MealPlan

            return (
                db.query(MealPlan.id)
                .filter(MealPlan.user_id == user_id, MealPlan.plan_date == day + timedelta(days=1))
                .first()
                is not None
            )
        except Exception:  # noqa: BLE001
            return False

    return check

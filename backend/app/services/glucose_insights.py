"""Glucose insights: Trends, Food impact and Patterns, built only from the user's own
logged data with fixed rules (no AI, no general health claims).

Every insight states the counts behind it ("3 of 3 times"), needs a minimum amount of
data before it appears, and is an observation, never advice. Texts carry no glucose
values, so they read the same in mg/dL and mmol/L; numeric fields are mg/dL and the
app converts them.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta

from . import glucose_targets
from .meal_diary import build_diary

MIN_CHECKED_MEALS = 3      # meals with an after reading before Food impact has anything to say
MIN_FOOD_TIMES = 2         # a food appears once it has been eaten and checked this often
MIN_PATTERN_READINGS = 6
MIN_SLOT_READINGS = 3

OFF_TARGET = {"above", "below", "low", "very_high"}
ABOVE = {"above", "very_high"}

TIME_SLOTS = [  # local hour ranges
    ("morning", "Morning", 5, 11),
    ("afternoon", "Afternoon", 11, 17),
    ("evening", "Evening", 17, 22),
    ("night", "Night", 22, 5),
]

CARB_BANDS = [
    ("low", "Under 30g carbs", 0, 30),
    ("mid", "30-45g carbs", 30, 45),
    ("high", "Over 45g carbs", 45, None),
]

_SPLIT = re.compile(r",|&|\+|\(|/| with | and | - ", re.I)
_LEAD = re.compile(r"^(?:\d+\s*x?\s*|a |an |some |my )+", re.I)


def food_key(description: str) -> str:
    """Rough grouping key for a typed meal: "Jollof rice & chicken" -> "jollof rice".
    Good enough until meals get a standard food name at log time."""
    text = (description or "").strip().lower()
    head = _SPLIT.split(text, maxsplit=1)[0]
    head = _LEAD.sub("", head.strip())
    head = re.sub(r"[^a-z0-9' ]+", " ", head)
    return re.sub(r"\s+", " ", head).strip()


def _times(n: int) -> str:
    return "1 time" if n == 1 else f"{n} times"


def _slot_for(hour: int) -> str:
    for key, _label, start, end in TIME_SLOTS:
        if (start <= hour < end) if start < end else (hour >= start or hour < end):
            return key
    return "night"


def _trends(readings, prev_readings, targets, days: int) -> dict:
    statuses = [glucose_targets.classify(r.value_mg_dl, r.context, targets)["status"] for r in readings]
    prev = [glucose_targets.classify(r.value_mg_dl, r.context, targets)["status"] for r in prev_readings]
    on, n = statuses.count("in_range"), len(statuses)
    prev_on, prev_n = prev.count("in_range"), len(prev)
    insights = []
    if n:
        line = f"{on} of {n} readings on target in the last {days} days"
        if prev_n:
            share, prev_share = on / n, prev_on / prev_n
            if share > prev_share:
                line += f", up from {prev_on} of {prev_n} the {days} days before"
            elif share < prev_share:
                line += f", compared with {prev_on} of {prev_n} the {days} days before"
            else:
                line += ", about the same as before"
        insights.append(line + ".")
        lows, very_highs = statuses.count("low"), statuses.count("very_high")
        if lows or very_highs:
            parts = [p for p in (f"{lows} low" if lows else "", f"{very_highs} very high" if very_highs else "") if p]
            insights.append(f"{' and '.join(parts)} reading{'s' if lows + very_highs > 1 else ''} in this period. "
                            "If this keeps happening, talk to your healthcare team.")
    return {
        "readings": n,
        "on_target": on,
        "prev_readings": prev_n,
        "prev_on_target": prev_on,
        "insights": insights,
    }


def _food_impact(diary_items) -> dict:
    checked = [i for i in diary_items if i["kind"] == "meal" and i["after"]]
    groups: dict[str, dict] = defaultdict(lambda: {"meals": []})
    for meal in checked:
        # A standard name (from the typed-meal estimate) groups best; else the text.
        key = (meal.get("food_name") or "").strip().lower() or food_key(meal["description"])
        if key:
            groups[key]["meals"].append(meal)

    foods = []
    for key, g in groups.items():
        meals = g["meals"]
        statuses = [m["after"]["status"] for m in meals]
        foods.append({
            "key": key,
            "name": key[:1].upper() + key[1:],
            "times": len(meals),
            "on_target": statuses.count("in_range"),
            "above": sum(s in ABOVE for s in statuses),
            "avg_after_mg_dl": round(sum(m["after"]["value_mg_dl"] for m in meals) / len(meals)),
            "meal_ids": [m["id"] for m in meals],
        })

    eligible = [f for f in foods if f["times"] >= MIN_FOOD_TIMES]
    to_watch = sorted(
        [f for f in eligible if f["above"] >= 2 and f["above"] / f["times"] >= 0.6],
        key=lambda f: (-f["above"] / f["times"], -f["times"]),
    )
    works = sorted(
        [f for f in eligible if f["on_target"] >= 2 and f["on_target"] / f["times"] >= 0.75],
        key=lambda f: (-f["on_target"] / f["times"], -f["times"]),
    )

    bands = []
    for key, label, low, high in CARB_BANDS:
        in_band = [
            m for m in checked
            if m.get("carbs_g") is not None and m["carbs_g"] >= low and (high is None or m["carbs_g"] < high)
        ]
        if in_band:
            statuses = [m["after"]["status"] for m in in_band]
            bands.append({
                "key": key,
                "label": label,
                "checked": len(in_band),
                "on_target": statuses.count("in_range"),
                "above": sum(s in ABOVE for s in statuses),
            })

    insights = []
    if to_watch:
        f = to_watch[0]
        insights.append(f"{f['name']} was above target {f['above']} of {f['times']} times after eating.")
    if works:
        f = works[0]
        insights.append(f"{f['name']} kept you on target {f['on_target']} of {f['times']} times.")
    by_band = {b["key"]: b for b in bands}
    high, low = by_band.get("high"), by_band.get("low")
    if high and high["checked"] >= 2 and high["above"] / high["checked"] >= 0.5:
        line = f"Meals over 45g carbs were above target {high['above']} of {high['checked']} times"
        if low and low["checked"] >= 2:
            line += f"; under 30g, on target {low['on_target']} of {low['checked']} times"
        insights.append(line + ".")

    needed = max(0, MIN_CHECKED_MEALS - len(checked))
    return {
        "checked_meals": len(checked),
        "needed": needed,
        "foods_to_watch": to_watch[:5],
        "foods_that_work": works[:5],
        "carb_bands": [b for b in bands if b["checked"] >= 2],
        "insights": insights[:3] if not needed else [],
    }


def _patterns(readings, targets, tz_offset_minutes: int) -> dict:
    offset = timedelta(minutes=tz_offset_minutes)
    slots = {key: {"key": key, "label": label, "readings": 0, "on_target": 0, "total": 0} for key, label, *_ in TIME_SLOTS}
    week = {"weekday": [0, 0], "weekend": [0, 0]}  # [on_target, readings]
    fasting = []
    for r in sorted(readings, key=lambda r: r.logged_at):
        local = r.logged_at + offset
        status = glucose_targets.classify(r.value_mg_dl, r.context, targets)["status"]
        slot = slots[_slot_for(local.hour)]
        slot["readings"] += 1
        slot["total"] += r.value_mg_dl
        slot["on_target"] += status == "in_range"
        bucket = week["weekend" if local.weekday() >= 5 else "weekday"]
        bucket[0] += status == "in_range"
        bucket[1] += 1
        if r.context == "fasting":
            fasting.append(r.value_mg_dl)

    slot_list = []
    for s in slots.values():
        if s["readings"]:
            s["avg_mg_dl"] = round(s["total"] / s["readings"])
            slot_list.append({k: v for k, v in s.items() if k != "total"})

    insights = []
    enough = len(readings) >= MIN_PATTERN_READINGS
    if enough:
        ranked = [s for s in slot_list if s["readings"] >= MIN_SLOT_READINGS]
        if len(ranked) >= 2:
            worst = max(ranked, key=lambda s: (s["readings"] - s["on_target"]) / s["readings"])
            best = max(ranked, key=lambda s: s["on_target"] / s["readings"])
            off = worst["readings"] - worst["on_target"]
            if off / worst["readings"] >= 0.5:
                insights.append(
                    f"Your {worst['label'].lower()} readings were off target most often ({off} of {worst['readings']})."
                )
            if best is not worst and best["on_target"] / best["readings"] >= 0.75:
                insights.append(
                    f"{best['label']} was your best time: {best['on_target']} of {best['readings']} on target."
                )
        wd, we = week["weekday"], week["weekend"]
        if wd[1] >= 3 and we[1] >= 3:
            diff = we[0] / we[1] - wd[0] / wd[1]
            if abs(diff) >= 0.25:
                better, worse = ("weekends", "weekdays") if diff > 0 else ("weekdays", "weekends")
                insights.append(f"You were on target more often on {better} than on {worse}.")
        if len(fasting) >= 4:
            half = len(fasting) // 2
            early = sum(fasting[:half]) / half
            recent = sum(fasting[half:]) / (len(fasting) - half)
            if recent <= early - 10:
                insights.append("Your fasting readings have been coming down.")
            elif recent >= early + 10:
                insights.append("Your fasting readings have been creeping up.")

    return {
        "readings": len(readings),
        "needed": max(0, MIN_PATTERN_READINGS - len(readings)),
        "time_slots": slot_list,
        "weekday": {"on_target": week["weekday"][0], "readings": week["weekday"][1]},
        "weekend": {"on_target": week["weekend"][0], "readings": week["weekend"][1]},
        "fasting_readings": len(fasting),
        "insights": insights[:3],
    }


CHECK_WINDOW = timedelta(hours=3)
IDEAL_CHECK = timedelta(hours=2)


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"



MEAL_SLOTS = [  # local hour ranges for "which meal of the day"
    ("breakfast", "Breakfast", 5, 11),
    ("lunch", "Lunch", 11, 16),
    ("dinner", "Dinner", 16, 22),
]
MIN_CARB_MEALS = 3        # meals with carbs (last 7 days) before carb insights appear
HIGH_CARB_REGULAR_G = 40  # a regular meal at or above this is worth pointing out


def _carb_insights(meals, now: datetime, tz_offset_minutes: int, carb_goal_g: int | None, goal_mode: str) -> dict:
    """Insights from carbs alone, so people who log meals but rarely test still learn
    something about their own food. Uses the last 7 days for averages and the whole
    window for "regular meals"."""
    offset = timedelta(minutes=tz_offset_minutes)
    with_carbs = [m for m in meals if getattr(m, "carbs_g", None) is not None]
    week = [m for m in with_carbs if m.logged_at >= now - timedelta(days=7)]
    insights: list[str] = []
    out = {"meals_with_carbs": len(week), "avg_carbs_g": None, "per_meal_guide_g": None, "insights": insights}
    if len(week) < MIN_CARB_MEALS:
        return out

    avg = sum(m.carbs_g for m in week) / len(week)
    out["avg_carbs_g"] = round(avg)
    if goal_mode == "ceiling" and carb_goal_g:
        guide = round(carb_goal_g / 3)
        out["per_meal_guide_g"] = guide
        if avg > guide * 1.1:
            insights.append(f"Your meals averaged {round(avg)}g carbs this week, a bit over your {guide}g per-meal guide.")
        elif avg < guide * 0.9:
            insights.append(f"Your meals averaged {round(avg)}g carbs this week, comfortably within your {guide}g per-meal guide.")
        else:
            insights.append(f"Your meals averaged {round(avg)}g carbs this week, right around your {guide}g per-meal guide.")
    else:
        insights.append(f"Your meals averaged {round(avg)}g carbs this week.")

    # Lightest and heaviest meal of the day (needs 2+ meals in at least two slots).
    by_slot: dict[str, list[float]] = {}
    for m in week:
        hour = (m.logged_at + offset).hour
        for key, _label, start, end in MEAL_SLOTS:
            if start <= hour < end:
                by_slot.setdefault(key, []).append(m.carbs_g)
    labels = {key: label for key, label, *_ in MEAL_SLOTS}
    averages = {k: sum(v) / len(v) for k, v in by_slot.items() if len(v) >= 2}
    if len(averages) >= 2:
        light = min(averages, key=averages.get)
        heavy = max(averages, key=averages.get)
        if averages[heavy] - averages[light] >= 10:
            insights.append(f"{labels[light]} is your lightest meal: about {round(averages[light])}g carbs on average.")

    # Highest-carb food they eat regularly (2+ times in the window).
    groups: dict[str, list] = {}
    for m in with_carbs:
        key = (getattr(m, "food_name", None) or "").strip().lower() or food_key(m.description or "")
        if key:
            groups.setdefault(key, []).append(m.carbs_g)
    regular = {k: sum(v) / len(v) for k, v in groups.items() if len(v) >= 2}
    if regular:
        top = max(regular, key=regular.get)
        if regular[top] >= HIGH_CARB_REGULAR_G:
            insights.append(f"{top[:1].upper() + top[1:]} is your highest-carb regular meal: about {round(regular[top])}g.")
    out["insights"] = insights[:3]
    return out


def _highlight(trends: dict, food: dict, patterns: dict, diary_items, now: datetime, carbs: dict | None = None) -> dict:
    """The one thing worth showing on Home. A meal that still needs its after-meal reading
    comes first (the moment to act); then real insights; otherwise a nudge that teaches
    the meal -> reading loop."""
    pending = [
        i for i in diary_items
        if i["kind"] == "meal" and not i["after"] and timedelta(0) <= now - i["logged_at"] <= CHECK_WINDOW
    ]
    if pending:
        meal = max(pending, key=lambda i: i["logged_at"])
        return {
            "kind": "check_meal",
            "text": f"Check your glucose about 2 hours after eating to see how {meal['description']} affects you.",
            "tab": None,
            "action": "log_glucose_after",
            "meal": {"id": meal["id"], "description": meal["description"], "logged_at": _iso(meal["logged_at"])},
            "check_at": _iso(meal["logged_at"] + IDEAL_CHECK),
        }
    if food["insights"]:
        return {"kind": "insight", "text": food["insights"][0], "tab": "food", "action": None}
    if patterns["insights"]:
        return {"kind": "insight", "text": patterns["insights"][0], "tab": "patterns", "action": None}
    if trends["readings"] >= 3 and trends["insights"]:
        return {"kind": "insight", "text": trends["insights"][0], "tab": "trends", "action": None}
    if carbs and carbs.get("insights"):
        # Meals logged but not enough readings for anything else: learn from the carbs,
        # with a gentle nudge to add a reading.
        return {
            "kind": "insight",
            "text": carbs["insights"][0],
            "sub": "Check your glucose 2 hours after a meal to see its effect.",
            "tab": "food",
            "action": None,
        }
    has_meals = any(i["kind"] == "meal" for i in diary_items)
    if trends["readings"] and not has_meals:
        return {
            "kind": "nudge",
            "text": "Log what you eat to see which foods affect your readings.",
            "tab": None,
            "action": "log_meal",
        }
    return {
        "kind": "nudge",
        "text": "Log a meal, then your glucose about 2 hours later, to see which foods work for you.",
        "tab": None,
        "action": "log_meal",
    }


def build_insights(meals, readings, prev_readings, targets, days: int, tz_offset_minutes: int = 0, now=None,
                   carb_goal_g: int | None = None, goal_mode: str = "ceiling") -> dict:
    now = now or datetime.utcnow()
    keep = lambda obj: {  # noqa: E731 - minimal serializers for the pairing step
        k: getattr(obj, k) for k in ("id", "description", "food_name", "carbs_g", "value_mg_dl", "context", "logged_at") if hasattr(obj, k)
    }
    diary = build_diary(meals, readings, targets, keep, keep)
    trends = _trends(readings, prev_readings, targets, days)
    food = _food_impact(diary)
    patterns = _patterns(readings, targets, tz_offset_minutes)
    carbs = _carb_insights(meals, now, tz_offset_minutes, carb_goal_g, goal_mode)
    food["carb_insights"] = carbs["insights"]
    food["carbs"] = {k: v for k, v in carbs.items() if k != "insights"}
    return {
        "days": days,
        "generated_at": _iso(now),
        "trends": trends,
        "food": food,
        "patterns": patterns,
        "highlight": _highlight(trends, food, patterns, diary, now, carbs),
    }

"""Makes the daily tip personal and visual (rules only, no AI per request).

- Personal tip: on alternate days, when the user's own readings show a food that keeps going
  above target (glucose_insights foods_to_watch), today's tip is about that food, with their numbers.
- Photo: a real food photo from the shared food image library (generated once, then reused).
- Compare: "this vs that" estimated glucose curves (glucose_impact) for food tips, e.g. rice alone
  vs rice with chicken and vegetables.
"""

from __future__ import annotations

import logging
import re
import threading
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from . import food_image_library, glucose_impact

logger = logging.getLogger(__name__)

# Keyword in the tip -> food to photograph.
PHOTO_RULES = [
    (r"snack", "Apple slices with peanut butter"),
    (r"water", "Glass of water with lemon"),
    (r"\btea\b", "Cup of green tea"),
    (r"juice|soda|sugary drink", "Glass of sparkling water with lemon"),
    (r"oat|porridge", "Steel-cut oats with berries"),
    (r"yogh?urt", "Greek yogurt with berries"),
    (r"\bnuts?\b|almond", "Small handful of almonds"),
    (r"berr|fruit", "Bowl of fresh berries"),
    (r"bean|lentil|chickpea", "Lentil and vegetable stew"),
    (r"\beggs?\b|omelet", "Vegetable omelette"),
    (r"fish|salmon", "Grilled salmon with vegetables"),
    (r"whole ?grain|brown rice|wholemeal", "Brown rice with vegetables"),
    (r"bread|toast", "Wholegrain toast"),
    (r"salad|vegetable|veg\b|greens|fib(er|re)|plate", "Plate of grilled chicken with salad"),
    (r"protein", "Grilled chicken with vegetables"),
    (r"breakfast", "Balanced breakfast plate with eggs and avocado"),
]

# Tip subject -> one clear comparison: (pattern on the tip's title + main text, chart title, plain
# one-line explanation, better option, its macros, original option, its macros). First match wins;
# no match means no chart (a chart about a different food than the tip only confuses).
COMPARE_RULES = [
    (r"snack", "Snack swap",
     "A snack with protein or healthy fat rises more gently than a sweet snack on its own.",
     "Apple with peanut butter", dict(carbs_g=20, sugars_g=15, fiber_g=5, protein_g=7, fat_g=16),
     "Two sweet biscuits", dict(carbs_g=20, sugars_g=10, fiber_g=0.5, protein_g=1.5, fat_g=5)),
    (r"juice|soda|fizzy|sugary drink|sweet drink|smoothie", "Drink swap",
     "Sugary drinks reach your blood fast because nothing slows them down. Water doesn't raise it at all.",
     "Water with lemon", dict(carbs_g=1, sugars_g=0, is_drink=True),
     "Glass of orange juice", dict(carbs_g=26, sugars_g=22, fiber_g=0.5, is_drink=True)),
    (r"whole ?grain|brown rice|wholemeal", "White vs wholegrain",
     "Wholegrains have more fibre, which slows how quickly the carbs turn into sugar.",
     "Wholegrain bread (2 slices)", dict(carbs_g=26, fiber_g=6, protein_g=8, fat_g=2),
     "White bread (2 slices)", dict(carbs_g=30, fiber_g=1.5, protein_g=5, fat_g=1)),
    (r"portion|smaller plate|second serving|serving size", "Portion size",
     "Same meal, fewer carbs: a smaller portion means a smaller rise.",
     "Smaller portion", dict(carbs_g=35, fiber_g=3, protein_g=20, fat_g=8),
     "Large portion", dict(carbs_g=65, fiber_g=3, protein_g=20, fat_g=8)),
    (r"vegetables? (first|before)|salad first|start (one |a |your )?(meal|lunch|dinner) with", "Vegetables first",
     "Eating vegetables first adds fibre that slows the carbs that follow.",
     "Pasta with a side salad first", dict(carbs_g=45, fiber_g=8, protein_g=12, fat_g=8),
     "Pasta on its own", dict(carbs_g=45, fiber_g=2, protein_g=8, fat_g=3)),
    (r"pair (rice|carbs|starch|bread|pasta)|carbs alone|(add )?protein (with|to|before) (your )?carbs", "Pairing your carbs",
     "Adding protein and vegetables to your carbs slows how fast sugar reaches your blood.",
     "Rice with chicken and vegetables", dict(carbs_g=40, fiber_g=5, protein_g=28, fat_g=9),
     "Rice on its own", dict(carbs_g=45, fiber_g=1, protein_g=4, fat_g=1)),
]

# Personal tips: at most twice a week (on two days 3 apart, offset per user so not everyone gets
# theirs on the same day), rotating through the user's foods to watch so it never repeats a food
# back to back. A food drops off by itself once readings after it are mostly on target again.
PERSONAL_DAYS = (1, 4)


def _personal_slot(user_id: int, day: date) -> int | None:
    """Running number of today's personal tip for this user, or None if today isn't one."""
    shifted = day.toordinal() + (int(user_id) % 7)
    pos = shifted % 7
    if pos not in PERSONAL_DAYS:
        return None
    return (shifted // 7) * len(PERSONAL_DAYS) + PERSONAL_DAYS.index(pos)


def _impact(macros: dict) -> dict | None:
    m = dict(macros)
    return glucose_impact.estimate_impact(
        carbs_g=m.get("carbs_g"), fiber_g=m.get("fiber_g"), protein_g=m.get("protein_g"),
        fat_g=m.get("fat_g"), sugars_g=m.get("sugars_g"), is_drink=bool(m.get("is_drink")),
    )


def _compare_for(text: str) -> dict | None:
    # Treating a low needs fast sugar: never show a chart that calls that the "worse" choice.
    if re.search(r"hypo|low blood sugar|lows?|treat (a )?low", text, re.I):
        return None
    for pattern, title, note, better, better_m, orig, orig_m in COMPARE_RULES:
        if title == "Snack swap" and re.search(r"exercise|bedtime|workout|before (a )?walk", text, re.I):
            continue  # These snacks are about having enough carbs, not fewer.
        if re.search(pattern, text, re.I):
            return {"title": title, "note": note, "main": {"label": better, "impact": _impact(better_m)},
                    "other": {"label": orig, "impact": _impact(orig_m)}}
    return None


def _photo(name: str | None) -> dict | None:
    if not name:
        return None
    url = food_image_library.lookup_one(name)
    pending = False
    if not url and food_image_library.needs_generation_quick(name):
        pending = True
        threading.Thread(target=food_image_library.generate_missing, args=([(name, None)],), daemon=True).start()
    return {"name": name, "url": url, "pending": pending}


def _photo_for_tip(text: str) -> str | None:
    for pattern, food in PHOTO_RULES:
        if re.search(pattern, text, re.I):
            return food
    return None


def _personal(db: Session, user, slot: int = 0) -> dict | None:
    """A tip built from the user's own after-meal readings, or None."""
    from ..models.glucose_reading import GlucoseReading
    from ..models.meal_log_entry import MealLogEntry
    from . import glucose_insights, glucose_targets

    since = datetime.utcnow() - timedelta(days=60)
    meals = db.query(MealLogEntry).filter(MealLogEntry.user_id == user.id, MealLogEntry.logged_at >= since).limit(1000).all()
    readings = db.query(GlucoseReading).filter(GlucoseReading.user_id == user.id, GlucoseReading.logged_at >= since).limit(5000).all()
    if not meals or not readings:
        return None
    food = glucose_insights.build_insights(meals, readings, [], glucose_targets.targets_for(user), 60)["food"]
    to_watch = food.get("foods_to_watch") or []
    if not to_watch:
        return None
    watch = to_watch[slot % len(to_watch)]  # a different food each personal day
    name = watch["name"]
    by_id = {m.id: m for m in meals}
    carbs = [by_id[i].carbs_g for i in watch.get("meal_ids", []) if i in by_id and by_id[i].carbs_g]
    usual = round(sum(carbs) / len(carbs)) if carbs else 45
    lower = name.lower()
    return {
        "id": f"personal-{watch['key'][:40]}",
        "title": f"Make your {lower} gentler",
        "tip": f"Pair {lower} with protein and vegetables, and have a slightly smaller portion.",
        "why": (
            f"After {lower}, your readings were above target {watch['above']} of {watch['times']} times. "
            "Protein, fibre and a smaller portion slow how fast the carbs reach your blood."
        ),
        "try_today": (
            f"Next time you have {lower}, fill half the plate with vegetables, add eggs, chicken, fish or beans, "
            f"and have about two-thirds of your usual amount. Then check your glucose 2 hours later."
        ),
        "category": "personal",
        "personal": {
            "food": name,
            "above": watch["above"],
            "times": watch["times"],
            "avg_after_mg_dl": watch.get("avg_after_mg_dl"),
        },
        "photo_food": name,
        "compare": {
            "title": f"Your {lower}, two ways",
            "note": f"Same {lower}, gentler rise: protein, vegetables and a smaller portion slow it down.",
            "main": {"label": f"{name} with protein and veg", "impact": _impact(dict(carbs_g=round(usual * 0.7), fiber_g=6, protein_g=28, fat_g=9))},
            "other": {"label": f"Your usual {lower}", "impact": _impact(dict(carbs_g=usual, fiber_g=1.5, protein_g=6, fat_g=4))},
        },
    }


def enrich(db: Session, user, tip: dict, *, on_date: date | None = None) -> dict:
    """Personal tip twice a week when the data supports one; photo and comparison for every tip."""
    day = on_date or datetime.utcnow().date()
    out = dict(tip or {})
    slot = _personal_slot(user.id, day) if user else None
    if slot is not None:
        try:
            personal = _personal(db, user, slot)
            if personal:
                out = personal
        except Exception as exc:  # noqa: BLE001
            logger.info("Personal tip skipped: %s", str(exc)[:160])
    if not out:
        return out
    # Match on what the tip is about (title + main line), not words in its small print.
    text = " ".join(str(out.get(k) or "") for k in ("title", "tip"))
    try:
        out["photo"] = _photo(out.pop("photo_food", None) or _photo_for_tip(text))
    except Exception:  # noqa: BLE001
        out["photo"] = None
    if "compare" not in out:
        try:
            out["compare"] = _compare_for(text)
        except Exception:  # noqa: BLE001
            out["compare"] = None
    return out

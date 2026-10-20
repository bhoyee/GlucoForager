"""Label analysis for packaged food (barcode scans): the UK front-of-pack traffic
lights, fibre claims, and plain-English insights about carbs for someone managing
blood sugar. Everything is rule-based and cites the standard it uses.

Standards:
- Traffic lights: UK Department of Health / Food Standards Agency front-of-pack
  guidance (2016), per 100g for food and per 100ml for drinks.
- Fibre: EU/UK nutrition claims (Regulation 1924/2006): "source of fibre" at 3g/100g,
  "high fibre" at 6g/100g.
"""

from __future__ import annotations

# (low_max, high_min): <= low_max is green, > high_min is red, otherwise amber.
FOOD_THRESHOLDS = {"fat": (3.0, 17.5), "saturates": (1.5, 5.0), "sugars": (5.0, 22.5), "salt": (0.3, 1.5)}
DRINK_THRESHOLDS = {"fat": (1.5, 8.75), "saturates": (0.75, 2.5), "sugars": (2.5, 11.25), "salt": (0.3, 0.75)}
LABELS = {"fat": "Fat", "saturates": "Saturates", "sugars": "Sugars", "salt": "Salt"}

# Portions over 100g/ml are also red when one portion exceeds 30% of the adult
# reference intake (same FSA guidance): fat 70g, saturates 20g, sugars 90g, salt 6g.
PORTION_RED_G = {"fat": 21.0, "saturates": 6.0, "sugars": 27.0, "salt": 1.8}

FIBRE_SOURCE_G = 3.0
FIBRE_HIGH_G = 6.0

NOVA_LABELS = {
    1: "Unprocessed or minimally processed",
    2: "Processed culinary ingredient",
    3: "Processed food",
    4: "Ultra-processed food",
}


def _num(nutriments: dict, *keys) -> float | None:
    for key in keys:
        value = nutriments.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        try:
            if value is not None:
                return float(str(value).replace(",", "."))
        except ValueError:
            continue
    return None


def _round(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def nutrient_table(nutriments: dict, suffix: str) -> dict:
    salt = _num(nutriments, f"salt{suffix}")
    if salt is None:
        sodium = _num(nutriments, f"sodium{suffix}")
        salt = sodium * 2.5 if sodium is not None else None
    carbs = _num(nutriments, f"carbohydrates{suffix}")
    fibre = _num(nutriments, f"fiber{suffix}")
    return {
        "calories": _round(_num(nutriments, f"energy-kcal{suffix}"), 0),
        "carbs_g": _round(carbs),
        "sugars_g": _round(_num(nutriments, f"sugars{suffix}")),
        "fiber_g": _round(fibre),
        "net_carbs_g": _round(carbs - fibre) if carbs is not None and fibre is not None else None,
        "protein_g": _round(_num(nutriments, f"proteins{suffix}")),
        "fat_g": _round(_num(nutriments, f"fat{suffix}")),
        "saturates_g": _round(_num(nutriments, f"saturated-fat{suffix}")),
        "salt_g": _round(salt, 2),
    }


def is_drink(product: dict) -> bool:
    tags = product.get("categories_tags") or []
    return any(t in ("en:beverages", "en:drinks") or t.startswith("en:soft-drinks") for t in tags) and not any(
        t.startswith("en:dairies") or t.startswith("en:milks") for t in tags
    )


def traffic_lights(per_100g: dict, drink: bool, per_serving: dict | None = None, serving_qty: float | None = None) -> list[dict]:
    thresholds = DRINK_THRESHOLDS if drink else FOOD_THRESHOLDS
    field = {"fat": "fat_g", "saturates": "saturates_g", "sugars": "sugars_g", "salt": "salt_g"}
    big_portion = bool(per_serving) and isinstance(serving_qty, (int, float)) and serving_qty > 100
    lights = []
    for key, (low_max, high_min) in thresholds.items():
        value = per_100g.get(field[key])
        if value is None:
            continue
        level = "low" if value <= low_max else "high" if value > high_min else "medium"
        portion = (per_serving or {}).get(field[key]) if big_portion else None
        if portion is not None and portion > PORTION_RED_G[key]:
            level = "high"
        lights.append({"key": key, "label": LABELS[key], "value_g": value, "level": level, "per_portion_g": portion})
    return lights


def fibre_claim(per_100g: dict) -> str | None:
    fibre = per_100g.get("fiber_g")
    if fibre is None:
        return None
    if fibre >= FIBRE_HIGH_G:
        return "high"
    if fibre >= FIBRE_SOURCE_G:
        return "source"
    return None


def meal_share(carbs_serving: float | None, carb_goal_g: int | None, goal_mode: str) -> dict | None:
    """Carbs in one serving vs a third of the user's daily carb goal (a typical meal).
    Not shown for goal_mode 'none' (Type 1: per-meal counting against insulin) or
    'floor' (gestational: the goal is a minimum, so a share would read the wrong way)."""
    if carbs_serving is None or not carb_goal_g or goal_mode != "ceiling":
        return None
    per_meal = round(carb_goal_g / 3)
    return {
        "carbs_g": carbs_serving,
        "meal_budget_g": per_meal,
        "daily_goal_g": carb_goal_g,
        "pct_of_meal": round(100 * carbs_serving / per_meal) if per_meal else None,
    }


def build_insights(*, per_serving: dict, per_100g: dict, lights: list[dict], fibre: str | None,
                   nova_group, share: dict | None, serving_size: str | None, drink: bool = False) -> list[dict]:
    """Up to 4 short observations, most important first. tone: good | warn | info."""
    out: list[dict] = []
    carbs = per_serving.get("carbs_g") if per_serving.get("carbs_g") is not None else per_100g.get("carbs_g")
    basis = f"per serving ({serving_size})" if per_serving.get("carbs_g") is not None and serving_size else (
        "per serving" if per_serving.get("carbs_g") is not None else "per 100g")

    if share and share.get("pct_of_meal") is not None:
        pct = share["pct_of_meal"]
        tone = "good" if pct <= 50 else "warn" if pct > 100 else "info"
        out.append({
            "tone": tone,
            "text": f"One serving has {share['carbs_g']:g}g carbs, about {pct}% of a typical meal "
                    f"for your {share['daily_goal_g']}g daily goal.",
        })
    elif carbs is not None:
        out.append({"tone": "info", "text": f"{carbs:g}g carbs {basis}."})

    sugars_light = next((l for l in lights if l["key"] == "sugars"), None)
    if sugars_light and sugars_light["level"] == "high":
        out.append({"tone": "warn", "text": "High in sugar on the UK traffic-light scale, which can raise glucose quickly."
                    + (" Sugary drinks are absorbed especially fast." if drink else "")})
    elif sugars_light and sugars_light["level"] == "low":
        out.append({"tone": "good", "text": "Low in sugar on the UK traffic-light scale."})

    if fibre == "high":
        out.append({"tone": "good", "text": "High in fibre, which helps slow how fast carbs reach your blood."})
    elif fibre == "source":
        out.append({"tone": "good", "text": "A source of fibre, which helps slow the glucose rise."})
    elif not drink and carbs is not None and carbs >= 15 and (per_serving.get("fiber_g") or per_100g.get("fiber_g") or 0) < 2:
        out.append({"tone": "warn", "text": "Little fibre for its carbs, so it may raise glucose faster. Pair it with protein or veg."})

    if isinstance(nova_group, (int, float)) and int(nova_group) == 4:
        out.append({"tone": "warn", "text": "Ultra-processed (NOVA 4). Whole foods tend to give steadier glucose."})

    reds = [l["label"].lower() for l in lights if l["level"] == "high" and l["key"] != "sugars"]
    if reds and len(out) < 4:
        out.append({"tone": "warn", "text": f"Also high in {' and '.join(reds)}."})
    return out[:4]


# ---- Country standards -------------------------------------------------------------
# US: FDA "5/20 rule" on %Daily Value per serving (5% or less is low, 20% or more is high).
# Canada: Health Canada front-of-pack "High in" symbol at 15% DV or more per serving.
# Daily Values: fat 78g, saturated fat 20g, sodium 2,300mg (= 5.75g salt), added sugars
# 50g (FDA); Canada uses fat 75g and total sugars 100g.
US_DV = {"fat": 78.0, "saturates": 20.0, "sugars": 50.0, "salt": 5.75}
CA_DV = {"fat": 75.0, "saturates": 20.0, "sugars": 100.0, "salt": 5.75}
FIELD = {"fat": "fat_g", "saturates": "saturates_g", "sugars": "sugars_g", "salt": "salt_g"}
DV_LABELS = {"fat": "Total fat", "saturates": "Sat. fat", "sugars": "Sugars", "salt": "Sodium"}


def _dv_lights(values: dict, dv: dict, low_max: float, high_min: float) -> list[dict]:
    lights = []
    for key in ("fat", "saturates", "sugars", "salt"):
        value = values.get(FIELD[key])
        if value is None:
            continue
        pct = round(100 * value / dv[key])
        level = "low" if pct <= low_max else "high" if pct >= high_min else "medium"
        item = {"key": key, "label": DV_LABELS[key], "value_g": value, "level": level, "pct_dv": pct}
        if key == "salt":
            item["value_mg"] = round(value / 2.5 * 1000)  # salt g -> sodium mg
        lights.append(item)
    return lights


def nutrient_ratings(per_100g: dict, per_serving: dict | None, drink: bool, country: str | None,
                     serving_qty: float | None = None) -> dict:
    """Front-of-pack style ratings in the user's own country's standard."""
    cc = (country or "").strip().upper()
    has_serving = bool(per_serving) and any(per_serving.get(f) is not None for f in FIELD.values())
    if cc == "US" and has_serving:
        return {
            "system": "us_fda_dv",
            "standard": "FDA %Daily Value per serving: 5% or less is low, 20% or more is high",
            "lights": _dv_lights(per_serving, US_DV, 5, 20),
        }
    if cc == "CA" and has_serving:
        return {
            "system": "ca_high_in",
            "standard": "Health Canada: 15% Daily Value or more per serving is high",
            "lights": _dv_lights(per_serving, CA_DV, 5, 15),
        }
    lights = traffic_lights(per_100g, drink, per_serving, serving_qty)
    unit = "per 100ml" if drink else "per 100g"
    if cc in ("GB", "UK", "IE"):
        standard = f"UK FSA traffic lights, {unit}"
    else:
        standard = f"Reference: UK traffic-light thresholds, {unit}"
    return {"system": "uk_fsa", "standard": standard, "lights": lights}

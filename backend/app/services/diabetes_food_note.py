"""Shared rule-based "is this food diabetes-friendly" heuristic, used by both the
barcode lookup (app_health_log.py) and the AI photo scan (app_food_scan.py) so the
two paths give consistent verdicts from the same named, transparent signals -
not a medical verdict, just visible flags a viewer can judge for themselves."""

# Sugar per serving/100g at or above this is flagged "high sugar" - a commonly used
# nutrition-label rule of thumb, not a personalized threshold.
HIGH_SUGAR_THRESHOLD_G = 10
# Ultra-processed on the NOVA classification (1=unprocessed, 4=ultra-processed).
ULTRA_PROCESSED_NOVA_GROUP = 4
# Meaningful carb load with very little fiber to slow absorption.
LOW_FIBER_CARB_THRESHOLD_G = 15
LOW_FIBER_THRESHOLD_G = 2


def build_diabetes_note(
    *,
    carbs_g: float | None,
    sugars_g: float | None,
    fiber_g: float | None,
    nova_group: float | int | None = None,
    nutriscore_grade: str | None = None,
) -> dict:
    flags: list[str] = []

    if sugars_g is not None and sugars_g >= HIGH_SUGAR_THRESHOLD_G:
        flags.append("High in sugar")

    if isinstance(nova_group, (int, float)) and int(nova_group) == ULTRA_PROCESSED_NOVA_GROUP:
        flags.append("Highly processed")

    if carbs_g is not None and carbs_g >= LOW_FIBER_CARB_THRESHOLD_G and (fiber_g is None or fiber_g < LOW_FIBER_THRESHOLD_G):
        flags.append("Low fiber for its carbs")

    if len(flags) == 0:
        verdict = "good_fit"
    elif len(flags) == 1:
        verdict = "moderate"
    else:
        verdict = "use_caution"

    return {
        "verdict": verdict,
        "flags": flags,
        "nova_group": nova_group,
        "nutriscore_grade": nutriscore_grade,
    }

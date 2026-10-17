"""Glucose target ranges and reading classification for the home "Track today" card.

Defaults follow the ADA general targets for adults with diabetes; users can change
them ("My targets") to whatever they agreed with their healthcare team. Everything is
stored and compared in mg/dL; the app converts to mmol/L for display.

Educational only - the app never suggests treatment changes based on these.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from ..models.user import User

# ADA general targets for adults with diabetes.
DEFAULT_PREMEAL_LOW = 80     # fasting / before meals: 80-130 mg/dL (4.4-7.2 mmol/L)
DEFAULT_PREMEAL_HIGH = 130
DEFAULT_POSTMEAL_HIGH = 180  # 1-2h after meals: below 180 mg/dL (10.0 mmol/L)

# Fixed safety bands - not user-adjustable.
LOW_MGDL = 70                # below 70 mg/dL (3.9 mmol/L) is low
VERY_HIGH_MGDL = 250         # 250 mg/dL (13.9 mmol/L) and above is very high
# Untagged / bedtime readings use the standard "time in range" band: 70-180 mg/dL.
GENERAL_HIGH = 180

# Bounds for user-entered targets (sanity, not clinical advice).
PREMEAL_LOW_BOUNDS = (60, 140)
PREMEAL_HIGH_BOUNDS = (90, 200)
POSTMEAL_HIGH_BOUNDS = (120, 250)

PREMEAL_CONTEXTS = {"fasting", "before_meal"}

IN_RANGE = "in_range"
ABOVE = "above"
BELOW = "below"
LOW = "low"
VERY_HIGH = "very_high"


@dataclass(frozen=True)
class GlucoseTargets:
    premeal_low: int = DEFAULT_PREMEAL_LOW
    premeal_high: int = DEFAULT_PREMEAL_HIGH
    postmeal_high: int = DEFAULT_POSTMEAL_HIGH
    is_default: bool = True

    def to_dict(self) -> dict:
        return {
            **asdict(self),
            "low_mg_dl": LOW_MGDL,
            "very_high_mg_dl": VERY_HIGH_MGDL,
            "general_high_mg_dl": GENERAL_HIGH,
        }


def targets_for(user: User) -> GlucoseTargets:
    low = getattr(user, "glucose_target_premeal_low_mgdl", None)
    high = getattr(user, "glucose_target_premeal_high_mgdl", None)
    post = getattr(user, "glucose_target_postmeal_high_mgdl", None)
    if low is None and high is None and post is None:
        return GlucoseTargets()
    return GlucoseTargets(
        premeal_low=int(low or DEFAULT_PREMEAL_LOW),
        premeal_high=int(high or DEFAULT_PREMEAL_HIGH),
        postmeal_high=int(post or DEFAULT_POSTMEAL_HIGH),
        is_default=False,
    )


def target_range(context: str | None, targets: GlucoseTargets) -> tuple[int, int]:
    """(low, high) in-range bounds for a reading's context. High is inclusive for
    pre-meal targets ("80-130") and exclusive for post-meal/general ("below 180")."""
    if context in PREMEAL_CONTEXTS:
        return targets.premeal_low, targets.premeal_high
    if context == "after_meal":
        return LOW_MGDL, targets.postmeal_high
    return LOW_MGDL, GENERAL_HIGH


def classify(value_mg_dl: int, context: str | None, targets: GlucoseTargets) -> dict:
    """Status of one reading plus how far it is from the target range (mg/dL)."""
    value = int(value_mg_dl)
    low, high = target_range(context, targets)
    premeal = context in PREMEAL_CONTEXTS

    if value < LOW_MGDL:
        status, delta = LOW, LOW_MGDL - value
    elif value >= VERY_HIGH_MGDL:
        status, delta = VERY_HIGH, value - high
    elif (value > high) if premeal else (value >= high):
        status, delta = ABOVE, value - high
    elif value < low:
        status, delta = BELOW, low - value
    else:
        status, delta = IN_RANGE, 0
    return {"status": status, "delta_mg_dl": delta, "target_low": low, "target_high": high}


def validate_targets(premeal_low: int, premeal_high: int, postmeal_high: int) -> str | None:
    """Returns an error message, or None if the targets are acceptable."""
    checks = [
        (premeal_low, PREMEAL_LOW_BOUNDS, "Before-meal low"),
        (premeal_high, PREMEAL_HIGH_BOUNDS, "Before-meal high"),
        (postmeal_high, POSTMEAL_HIGH_BOUNDS, "After-meal high"),
    ]
    for value, (lo, hi), label in checks:
        if not lo <= value <= hi:
            return f"{label} target must be between {lo} and {hi} mg/dL."
    if premeal_low >= premeal_high:
        return "Before-meal low target must be below the high target."
    if postmeal_high < premeal_high:
        return "After-meal target should not be lower than the before-meal high target."
    return None

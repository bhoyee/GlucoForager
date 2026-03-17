import hashlib
import re


_LEADING_QTY_RE = re.compile(
    r"^\s*"
    r"(?:(?:\d+\s*/\s*\d+)|(?:\d+(?:\.\d+)?))"  # 1/2, 2, 2.5
    r"(?:\s*(?:x|×))?\s*"
    r"(?:(?:cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|g|kg|mg|ml|l|oz|lb|lbs|pound|pounds)"
    r"(?:\b|s\b))?"
    r"\s*",
    re.IGNORECASE,
)


def normalize_ingredient_for_fingerprint(value: str) -> str:
    """
    Normalize ingredient text so fingerprints stay stable across UI/backend formatting.

    Examples:
      "2 eggs" -> "eggs"
      "1/2 cup spinach" -> "spinach"
      "150g chicken breast" -> "chicken breast"
    """
    text = (value or "").strip().lower()
    if not text:
        return ""

    # Remove leading quantities / common units.
    text = _LEADING_QTY_RE.sub("", text).strip()

    # Remove trailing parenthetical notes and extra punctuation.
    text = re.sub(r"\([^)]*\)", "", text).strip()
    text = re.sub(r"[•·]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def recipe_fingerprint(*, title: str, ingredients: list[str]) -> str:
    title_norm = (title or "").strip().lower()
    normalized = sorted(
        {
            normalize_ingredient_for_fingerprint(item)
            for item in (ingredients or [])
            if item and normalize_ingredient_for_fingerprint(item)
        }
    )
    raw = f"{title_norm}|{','.join(normalized)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


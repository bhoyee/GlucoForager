"""Normalised keys for the recipe bank.

title_key:       "Tomato & Egg Scramble!" -> "tomato and egg scramble" (one recipe per title).
ingredient_key:  "2 large red bell peppers, diced" -> "bell pepper" (what's in the fridge, not how it's cut).

Kept dependency-free: the recipes migration uses these to backfill existing rows.
"""

from __future__ import annotations

import re

# Supporting ingredients every kitchen has: never needed to "match" a fridge.
STAPLES = {
    "water", "salt", "pepper", "black pepper", "oil", "olive oil", "vegetable oil", "cooking spray",
    "garlic", "onion", "lemon", "lime", "lemon juice", "lime juice", "vinegar", "herb", "spice", "dried herb",
    "mixed herb", "chili flake", "chilli flake", "paprika", "cumin", "turmeric", "oregano", "thyme", "basil",
    "parsley", "coriander", "cilantro", "cinnamon", "ginger", "stock", "broth", "seasoning", "curry powder",
}

_DESCRIPTORS = {
    "fresh", "frozen", "dried", "chopped", "diced", "sliced", "minced", "grated", "shredded", "cooked",
    "uncooked", "raw", "boiled", "roasted", "large", "medium", "small", "ripe", "unripe", "whole", "low",
    "fat", "free", "lean", "boneless", "skinless", "plain", "unsweetened", "light", "red", "green",
    "yellow", "orange", "white", "brown", "baby", "extra", "virgin", "finely", "roughly", "thinly",
    "of", "a", "an", "the", "and", "or", "to", "taste", "for", "garnish", "optional", "pinch", "handful",
    "cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "g", "kg", "ml",
    "l", "oz", "lb", "clove", "cloves", "slice", "slices", "piece", "pieces", "can", "tin", "packet",
}

_SYNONYMS = {
    "egg white": "egg",
    "yoghurt": "yogurt",
    "greek yogurt": "yogurt",
    "courgette": "zucchini",
    "aubergine": "eggplant",
    "bell pepper": "bell pepper",
    "capsicum": "bell pepper",
    "sweet pepper": "bell pepper",
    "scallion": "spring onion",
    "green onion": "spring onion",
    "chickpeas": "chickpea",
    "garbanzo": "chickpea",
    "prawn": "shrimp",
    "minced beef": "beef",
    "ground beef": "beef",
    "chicken breast": "chicken",
    "chicken thigh": "chicken",
    "cheddar": "cheese",
    "cheddar cheese": "cheese",
    "feta cheese": "feta",
    "rolled oat": "oat",
    "oatmeal": "oat",
    "porridge oat": "oat",
}


def title_key(title: str) -> str:
    t = str(title or "").lower().replace("&", " and ")
    t = re.sub(r"[^a-z0-9\s]+", " ", t)
    words = []
    for w in t.split():
        if len(w) > 3 and w.endswith("ies"):
            w = w[:-3] + "y"
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        words.append(w)
    return " ".join(words)[:160]


def _singular(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("oes"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def ingredient_key(name: str) -> str:
    t = str(name or "").lower()
    t = re.sub(r"\(.*?\)", " ", t)
    t = t.split(",")[0]
    t = re.sub(r"[^a-z\s]+", " ", t)
    words = [_singular(w) for w in t.split() if w not in _DESCRIPTORS]
    key = " ".join(words).strip()
    return _SYNONYMS.get(key, key)


def ingredient_keys(ingredients) -> list[str]:
    """Main (non-staple) ingredient keys for a recipe or a fridge, de-duplicated, order kept."""
    out: list[str] = []
    for item in ingredients or []:
        name = item.get("name") if isinstance(item, dict) else item
        key = ingredient_key(name)
        if key and key not in STAPLES and key not in out:
            out.append(key)
    return out

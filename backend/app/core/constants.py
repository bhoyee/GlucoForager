DEFAULT_DIABETES_TAG = "diabetes-friendly"
DEFAULT_TAGS = ["diabetes-friendly", "low-carb", "low-glycemic", "high-fiber"]
MATCH_THRESHOLD = 0.3
FREE_SEARCH_LIMIT = 3
ACCESS_TOKEN_EXPIRE_MINUTES = 60
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 300  # 5 minutes
LOGIN_LOCKOUT_SECONDS = 900  # 15 minutes
TIER_CONFIG = {
    "free": {
        "max_daily_scans": 3,
        "vision_model": "gpt-4o-mini-vision",
        "recipe_model": "gpt-4o-mini",
        "cache_priority": "high",
    },
    "premium": {
        "max_daily_scans": None,  # unlimited
        "vision_model": "gpt-5-vision",
        "recipe_model": "gpt-5",
        "cache_priority": "low",
    },
}

# Nutrition defaults keep structure consistent even when upstream data is sparse.
EMPTY_NUTRITION = {
    "calories": 0,
    "carbs": 0,
    "protein": 0,
    "fat": 0,
    "fiber": 0,
    "sugar": 0,
    "glycemic_index": None,
}

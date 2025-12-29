DEFAULT_DIABETES_TAG = "diabetes-friendly"
DEFAULT_TAGS = ["diabetes-friendly", "low-carb", "low-glycemic", "high-fiber"]
MATCH_THRESHOLD = 0.3
FREE_SEARCH_LIMIT = 3
ACCESS_TOKEN_EXPIRE_MINUTES = 60

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

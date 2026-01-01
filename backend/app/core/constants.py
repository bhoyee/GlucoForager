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
        "vision_model": "gpt-4o-2024-11-20",
        "recipe_models": [
            "gpt-4o-mini-2024-07-18",
            "deepseek-chat",
        ],
        "cache_priority": "high",
    },
    "premium": {
        "max_daily_scans": None,  # unlimited
        "vision_model": "gpt-4o-2024-11-20",  # vision-capable
        "recipe_models": [
            "gpt-5.2-2025-12-11",
            "gpt-5.1-2025-11-13",
            "gpt-5-2025-08-07",
            "deepseek-chat",
        ],
        "cache_priority": "low",
    },
}

OPENAI_PROMPT = """You are a certified diabetes nutritionist. Create 3 diabetic-friendly recipes using ONLY: {ingredients}.

REQUIREMENTS FOR EACH RECIPE:
1. Name the recipe specifically
2. Include prep_time, cook_time (minutes)
3. List ingredients with quantities and units
4. Step-by-step cooking instructions
5. Nutritional info PER SERVING: calories, carbs, protein, fat, fiber, sugar, sodium
6. Diabetes analysis: glycemic impact, carb type, safety rating
7. Tags: diabetes-friendly, low-carb, etc.

NUTRITIONAL CONSTRAINTS:
- Calories: 250-400 per serving
- Carbs: MAX 30g per serving
- Protein: MIN 25g per serving
- Fiber: MIN 5g per serving
- No added sugars

FORMAT: Return VALID JSON with this EXACT structure:
{
  "recipes": [
    {
      "name": "Recipe Name 1",
      "prep_time": 10,
      "cook_time": 20,
      "ingredients": [
        {"name": "ingredient1", "quantity": 1, "unit": "cup"},
        {"name": "ingredient2", "quantity": 2, "unit": "tbsp"}
      ],
      "instructions": ["Step 1", "Step 2"],
      "nutrition_per_serving": {
        "calories": 320,
        "carbs": 15,
        "protein": 35,
        "fat": 12,
        "fiber": 6,
        "sugar": 3,
        "sodium": 400
      },
      "diabetes_analysis": {
        "glycemic_impact": "Low",
        "carb_type": "Complex carbohydrates",
        "safety_rating": "Excellent"
      },
      "tags": ["diabetes-friendly", "low-carb"]
    },
    {
      "name": "Recipe Name 2",
      "...": "(same structure)"
    },
    {
      "name": "Recipe Name 3",
      "...": "(same structure)"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No additional text before or after.
"""

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

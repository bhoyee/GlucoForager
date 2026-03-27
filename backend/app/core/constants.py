DEFAULT_DIABETES_TAG = "diabetes-friendly"
DEFAULT_TAGS = ["diabetes-friendly", "low-carb", "low-glycemic", "high-fiber"]
MATCH_THRESHOLD = 0.3
FREE_SEARCH_LIMIT = 3
ACCESS_TOKEN_EXPIRE_MINUTES = 60
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 300  # 5 minutes
LOGIN_LOCKOUT_SECONDS = 600  # 10 minutes
TIER_CONFIG = {
    "free": {
        "max_daily_scans": 3,
        "vision_model": "gpt-4o-2024-11-20",
        "recipe_models": [
            "gpt-4o-mini-2024-07-18",
            "deepseek-chat",
        ],
        # "Surprise me" / "Quick meal" should be fast and cheap.
        "recipe_models_fast": [
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
            "gpt-4o-2024-11-20",
            "gpt-4o-mini-2024-07-18",
            "deepseek-chat",
        ],
        # "Surprise me" / "Quick meal" should be fast and cheap even for premium.
        "recipe_models_fast": [
            "gpt-4o-2024-11-20",
            "gpt-4o-mini-2024-07-18",
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
4. Step-by-step cooking instructions (at least 5 steps). Start with prep (e.g., washing, chopping), end with plating/serving.
5. Nutritional info PER SERVING: calories, carbs, protein, fat, fiber, sugar, sodium
6. Short description (1-2 sentences) describing why it is diabetes-friendly
7. Diabetes analysis: glycemic impact, carb type, safety rating
8. Diabetes management tips: 3-5 concise tips (array of strings)
9. Tags: diabetes-friendly, low-carb, etc.

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
      "instructions": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
      "description": "Short diabetes-friendly description here.",
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
      "tips": ["Tip 1", "Tip 2", "Tip 3"],
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

# Lightweight schema for "Eat now" flows (Surprise me / Low-carb quick meal).
# This avoids long responses that get truncated and become invalid JSON.
EAT_NOW_PROMPT = """Create 3 diabetes-friendly meal ideas. Use common, easy-to-find ingredients.

RULES:
- Return ONLY a single valid JSON object. No markdown, no code fences, no commentary.
- Provide exactly 3 recipes.
- Follow the schema EXACTLY. Do not add extra keys like "tips", "diabetes_analysis", "sodium", etc.
- All string values must be single-line (no newline characters). Use spaces instead.
- Keep it concise but usable:
  - max 10 ingredients per recipe
  - 6-8 instruction steps per recipe, with concrete details (minutes/heat/action)

FORMAT (VALID JSON):
{
  "recipes": [
    {
      "title": "Recipe title",
      "description": "1 sentence why diabetes-friendly",
      "prep_time": 10,
      "cook_time": 10,
      "total_time": 20,
      "servings": 2,
      "ingredients": [
        {"name": "ingredient", "quantity": 1, "unit": "cup"}
      ],
      "instructions": ["Step 1", "Step 2"],
      "nutritional_info": {
        "calories": 320,
        "carbs": 18,
        "protein": 28,
        "fat": 12,
        "fiber": 7,
        "sugar": 4
      },
      "tags": ["diabetes-friendly", "low-carb"]
    }
  ]
}
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

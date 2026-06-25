from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.responses import JSONResponse, Response
from starlette.datastructures import QueryParams


_NOW = datetime(2026, 6, 25, 10, 30, tzinfo=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


DEMO_USERS = [
    {
        "id": 9001,
        "name": "Amina Clarke",
        "full_name": "Amina Clarke",
        "email": "amina.demo@example.com",
        "platform": "iOS",
        "subscription_tier": "premium",
        "access_status": "trialing",
        "trial_days_left": 5,
        "trial_ends_at": _iso(_NOW + timedelta(days=5)),
        "created_at": _iso(_NOW - timedelta(days=2)),
        "is_suspended": False,
        "deleted_at": None,
    },
    {
        "id": 9002,
        "name": "Daniel Mensah",
        "full_name": "Daniel Mensah",
        "email": "daniel.demo@example.com",
        "platform": "Android",
        "subscription_tier": "premium",
        "access_status": "premium",
        "trial_days_left": 0,
        "expires_at": _iso(_NOW + timedelta(days=28)),
        "created_at": _iso(_NOW - timedelta(days=12)),
        "is_suspended": False,
        "deleted_at": None,
    },
    {
        "id": 9003,
        "name": "Priya Shah",
        "full_name": "Priya Shah",
        "email": "priya.demo@example.com",
        "platform": "iOS",
        "subscription_tier": "free",
        "access_status": "expired",
        "trial_days_left": 0,
        "created_at": _iso(_NOW - timedelta(days=21)),
        "is_suspended": False,
        "deleted_at": None,
    },
]

DEMO_RECIPES = [
    {
        "id": 8101,
        "name": "Mediterranean Chicken Bowl",
        "meal_type": "lunch",
        "description": "Lean chicken, salad vegetables, herbs, and a controlled portion of whole grains.",
        "prep_time_minutes": 12,
        "cook_time_minutes": 18,
        "servings": 2,
        "status": "published",
        "source": "manual",
        "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900",
        "ingredients": [
            {"name": "Chicken breast", "quantity": "200", "unit": "g", "note": "grilled"},
            {"name": "Cucumber", "quantity": "1", "unit": "cup", "note": "chopped"},
            {"name": "Brown rice", "quantity": "0.5", "unit": "cup", "note": "cooked"},
        ],
        "instructions": ["Grill the chicken.", "Prepare the vegetables.", "Serve with a measured portion of brown rice."],
        "nutrition": {"calories": 420, "carbs": 32, "protein": 38, "fat": 14, "fiber": 7, "sugar": 5},
        "created_at": _iso(_NOW - timedelta(days=7)),
    },
    {
        "id": 8102,
        "name": "Avocado Egg Breakfast Plate",
        "meal_type": "breakfast",
        "description": "A simple high-protein breakfast with healthy fats and fibre.",
        "prep_time_minutes": 8,
        "cook_time_minutes": 6,
        "servings": 1,
        "status": "draft",
        "source": "ai_draft",
        "image_url": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=900",
        "ingredients": [
            {"name": "Eggs", "quantity": "2", "unit": "", "note": "boiled"},
            {"name": "Avocado", "quantity": "0.5", "unit": "", "note": "sliced"},
            {"name": "Spinach", "quantity": "1", "unit": "cup", "note": "fresh"},
        ],
        "instructions": ["Boil the eggs.", "Slice avocado.", "Serve with spinach and black pepper."],
        "nutrition": {"calories": 330, "carbs": 12, "protein": 18, "fat": 24, "fiber": 8, "sugar": 2},
        "created_at": _iso(_NOW - timedelta(days=3)),
    },
]

DEMO_TIPS = [
    {"id": 7001, "title": "Build meals around protein first", "body": "Protein can help make meals more satisfying and support steadier glucose response.", "condition": "type_2", "is_active": True},
    {"id": 7002, "title": "Pair carbs with fibre", "body": "Choose vegetables, beans, or whole grains where possible instead of refined carbs alone.", "condition": "prediabetes", "is_active": True},
]

DEMO_CHALLENGES = [
    {"id": 6101, "title": "Add a non-starchy vegetable", "description": "Include spinach, broccoli, cucumber, peppers, or salad leaves with one meal today.", "points": 10, "is_active": True},
    {"id": 6102, "title": "Choose water first", "description": "Swap one sweet drink for water or unsweetened tea.", "points": 10, "is_active": True},
]

DEMO_POSTS = [
    {"id": 501, "title": "How GlucoForager helps with daily food decisions", "slug": "demo-food-decisions", "status": "published", "author": "GlucoForager Team", "created_at": _iso(_NOW - timedelta(days=10)), "published_at": _iso(_NOW - timedelta(days=9))},
    {"id": 502, "title": "Simple swaps for blood-sugar-friendly meals", "slug": "demo-simple-swaps", "status": "draft", "author": "GlucoForager Team", "created_at": _iso(_NOW - timedelta(days=4)), "published_at": None},
]

DEMO_COMMENTS = [
    {"id": 301, "post_id": 501, "post_title": DEMO_POSTS[0]["title"], "author_name": "Demo Reader", "author_email": "reader.demo@example.com", "body": "This made meal planning feel less stressful.", "status": "pending", "created_at": _iso(_NOW - timedelta(days=1))},
]

DEMO_LOGS = [
    {"id": 1, "created_at": _iso(_NOW - timedelta(minutes=18)), "level": "info", "source": "api", "message": "Demo health check completed", "details": "status=ok", "ip": "203.0.113.10"},
    {"id": 2, "created_at": _iso(_NOW - timedelta(minutes=42)), "level": "warn", "source": "api", "message": "Demo validation warning", "details": "sample payload only", "ip": "203.0.113.11"},
]

DEMO_MOBILE_LOGS = [
    {"id": 1, "received_at": _iso(_NOW - timedelta(minutes=25)), "level": "info", "source": "Mobile", "message": "Demo app session started", "user_email": "amina.demo@example.com", "app_version": "1.0.7", "device": "Pixel Demo", "ip": "198.51.100.20"},
    {"id": 2, "received_at": _iso(_NOW - timedelta(hours=2)), "level": "info", "source": "API", "message": "Demo recipe generated", "user_email": "daniel.demo@example.com", "app_version": "1.0.7", "device": "iPhone Demo", "ip": "198.51.100.21"},
]


def _json(payload: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=payload, status_code=status_code)


def _items(items: list[dict[str, Any]], total: int | None = None) -> dict[str, Any]:
    return {"items": items, "total": len(items) if total is None else total}


def _recipe_detail(recipe_id: int) -> dict[str, Any]:
    for recipe in DEMO_RECIPES:
        if int(recipe["id"]) == int(recipe_id):
            return recipe
    return DEMO_RECIPES[0]


def get_demo_admin_response(path: str, query: QueryParams, method: str) -> Response | None:
    method = (method or "GET").upper()
    if method not in {"GET", "HEAD", "OPTIONS"}:
        return _json({"detail": "Demo mode is read-only. Actions are disabled for portfolio walkthroughs."}, 403)

    subpath = str(path or "").removeprefix("/api/admin/").strip("/")
    if not subpath or subpath in {"me", "status"} or subpath.startswith("staff/login") or subpath.startswith("staff/refresh"):
        return None

    if subpath == "users/platform-summary":
        return _json({"ios": 2, "android": 1, "unknown": 0, "total": 3, "updated_at": _iso(_NOW)})
    if subpath == "users/access-summary":
        return _json({"trialing": 1, "cancelled_active": 0, "legacy_grace": 0, "expired": 1, "premium": 1, "blocked": 0, "suspended": 0, "deleted": 0, "total": 3})
    if subpath == "users":
        return _json(_items(DEMO_USERS))
    if subpath.startswith("users/"):
        return _json({"detail": "User detail is hidden in demo mode.", "user": DEMO_USERS[0]})

    if subpath == "recipes":
        return _json(_items(DEMO_RECIPES))
    if subpath.startswith("recipes/") and subpath.split("/")[-1].isdigit():
        return _json(_recipe_detail(int(subpath.split("/")[-1])))
    if subpath == "recipes/generate-drafts":
        return _json({"items": DEMO_RECIPES, "created": 0, "skipped_duplicates": 0})

    if subpath == "tips":
        return _json(_items(DEMO_TIPS))
    if subpath == "settings/tips":
        return _json({"enabled": True, "daily_limit": 1, "demo": True})
    if subpath == "tips/feedback-summary":
        return _json({"days": int(query.get("days", 7) or 7), "helpful": 18, "not_helpful": 3, "total": 21})

    if subpath == "challenge/tasks":
        return _json(_items(DEMO_CHALLENGES))
    if subpath == "challenge/snapshots":
        return _json(_items([{"date": "2026-06-25", "completed": 42, "skipped": 8, "total": 50}]))

    if subpath == "blog/posts":
        return _json(_items(DEMO_POSTS))
    if subpath == "blog/comments":
        return _json(_items(DEMO_COMMENTS))

    if subpath == "newsletter/subscribers":
        return _json(_items([{"id": 1, "email": "subscriber.demo@example.com", "status": "subscribed", "created_at": _iso(_NOW - timedelta(days=15))}]))
    if subpath == "newsletter":
        return _json({"items": [], "total": 0})

    if subpath.startswith("user-email") or subpath.startswith("email-campaigns"):
        return _json(_items([{"id": 1, "subject": "Demo onboarding campaign", "status": "sent", "created_at": _iso(_NOW - timedelta(days=2))}]))

    if subpath.startswith("settings/"):
        return _json({"enabled": True, "demo": True, "message": "Demo settings are read-only."})
    if subpath == "push-campaigns":
        return _json(_items([{"id": 1, "title": "Demo meal reminder", "body": "Try a balanced lunch today.", "status": "draft", "created_at": _iso(_NOW - timedelta(days=1))}]))
    if subpath == "notifications":
        return _json(_items([]))

    if subpath == "health":
        return _json({"status": "ok", "database": "ok", "redis": "ok", "ai_queue": "ok", "demo": True, "checked_at": _iso(_NOW)})
    if subpath == "health/ai-jobs":
        return _json({"items": [], "top_operational_reasons": [], "top_invalid_input_reasons": [], "failed_jobs": []})
    if subpath == "system-logs":
        return _json(_items(DEMO_LOGS))
    if subpath == "mobile-logs":
        return _json(_items(DEMO_MOBILE_LOGS))
    if subpath == "backups":
        return _json(_items([{"filename": "demo-backup-2026-06-25.sql.gz", "size_bytes": 1048576, "created_at": _iso(_NOW - timedelta(hours=6))}]))

    return _json({"detail": "This demo endpoint uses seeded portfolio data only and is not available for this screen."}, 403)

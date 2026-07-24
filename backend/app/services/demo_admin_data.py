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
        "registered_platform": "ios",
        "registered_app_version": "1.0.7",
        "subscription_tier": "premium",
        "access_status": "trialing",
        "trial_days_left": 5,
        "trial_ends_at": _iso(_NOW + timedelta(days=5)),
        "expires_at": _iso(_NOW + timedelta(days=5)),
        "created_at": _iso(_NOW - timedelta(days=2)),
        "last_active_at": _iso(_NOW - timedelta(minutes=12)),
        "country": "United Kingdom",
        "gender": "Female",
        "diabetes_type": "Type 2",
        "goals": ["lower carb", "weight management"],
        "dietary_preferences": ["halal"],
        "foods_to_avoid": ["pork", "sugary drinks"],
        "cuisine_preferences": ["West African", "British/Irish"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9002,
        "name": "Daniel Mensah",
        "full_name": "Daniel Mensah",
        "email": "daniel.demo@example.com",
        "platform": "Android",
        "registered_platform": "android",
        "registered_app_version": "1.0.7",
        "subscription_tier": "premium",
        "access_status": "premium",
        "trial_days_left": 0,
        "expires_at": _iso(_NOW + timedelta(days=28)),
        "created_at": _iso(_NOW - timedelta(days=12)),
        "last_active_at": _iso(_NOW - timedelta(hours=1)),
        "country": "Ghana",
        "gender": "Male",
        "diabetes_type": "Prediabetes",
        "goals": ["balanced meals", "quick meals"],
        "dietary_preferences": [],
        "foods_to_avoid": ["shellfish"],
        "cuisine_preferences": ["West African", "Mediterranean"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9003,
        "name": "Priya Shah",
        "full_name": "Priya Shah",
        "email": "priya.demo@example.com",
        "platform": "iOS",
        "registered_platform": "ios",
        "registered_app_version": "1.0.7",
        "subscription_tier": "premium",
        "access_status": "cancelled_active",
        "trial_days_left": 0,
        "trial_ends_at": _iso(_NOW + timedelta(days=9)),
        "expires_at": _iso(_NOW + timedelta(days=9)),
        "created_at": _iso(_NOW - timedelta(days=19)),
        "last_active_at": _iso(_NOW - timedelta(hours=5)),
        "country": "United Kingdom",
        "gender": "Female",
        "diabetes_type": "Gestational diabetes",
        "goals": ["high protein", "simple ingredients"],
        "dietary_preferences": ["vegetarian"],
        "foods_to_avoid": ["eggs"],
        "cuisine_preferences": ["South Asian", "British/Irish"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9004,
        "name": "Owen Baker",
        "full_name": "Owen Baker",
        "email": "owen.demo@example.com",
        "platform": "Android",
        "registered_platform": "android",
        "registered_app_version": "1.0.6",
        "subscription_tier": "free",
        "access_status": "legacy_grace",
        "trial_days_left": 3,
        "trial_grace_ends_at": _iso(_NOW + timedelta(days=3)),
        "created_at": _iso(_NOW - timedelta(days=44)),
        "last_active_at": _iso(_NOW - timedelta(days=1, hours=2)),
        "country": "Ireland",
        "gender": "Male",
        "diabetes_type": "Type 1",
        "goals": ["carb awareness"],
        "dietary_preferences": [],
        "foods_to_avoid": ["mushrooms"],
        "cuisine_preferences": ["British/Irish"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9005,
        "name": "Fatima Yusuf",
        "full_name": "Fatima Yusuf",
        "email": "fatima.demo@example.com",
        "platform": "Android",
        "registered_platform": "android",
        "registered_app_version": "1.0.7",
        "subscription_tier": "premium",
        "access_status": "trialing",
        "trial_days_left": 1,
        "trial_ends_at": _iso(_NOW + timedelta(days=1)),
        "expires_at": _iso(_NOW + timedelta(days=1)),
        "created_at": _iso(_NOW - timedelta(days=6)),
        "last_active_at": _iso(_NOW - timedelta(minutes=40)),
        "country": "Nigeria",
        "gender": "Female",
        "diabetes_type": "Type 2",
        "goals": ["lower carb", "meal planning"],
        "dietary_preferences": ["halal"],
        "foods_to_avoid": ["beef"],
        "cuisine_preferences": ["West African"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9006,
        "name": "Laura Hughes",
        "full_name": "Laura Hughes",
        "email": "laura.demo@example.com",
        "platform": "iOS",
        "registered_platform": "ios",
        "registered_app_version": "1.0.7",
        "subscription_tier": "free",
        "access_status": "expired",
        "trial_days_left": 0,
        "trial_ends_at": _iso(_NOW - timedelta(days=2)),
        "created_at": _iso(_NOW - timedelta(days=9)),
        "last_active_at": _iso(_NOW - timedelta(days=2)),
        "country": "United Kingdom",
        "gender": "Female",
        "diabetes_type": "Prediabetes",
        "goals": ["weight management"],
        "dietary_preferences": [],
        "foods_to_avoid": ["spicy food"],
        "cuisine_preferences": ["Mediterranean"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9007,
        "name": "Michael Chen",
        "full_name": "Michael Chen",
        "email": "michael.demo@example.com",
        "platform": "Android",
        "registered_platform": "android",
        "registered_app_version": "1.0.7",
        "subscription_tier": "free",
        "access_status": "blocked",
        "trial_days_left": 0,
        "created_at": _iso(_NOW - timedelta(days=31)),
        "last_active_at": _iso(_NOW - timedelta(days=7)),
        "country": "Canada",
        "gender": "Male",
        "diabetes_type": "Type 2",
        "goals": ["balanced meals"],
        "dietary_preferences": [],
        "foods_to_avoid": ["peanuts"],
        "cuisine_preferences": ["East Asian", "Mediterranean"],
        "onboarding_completed": True,
        "premium_access_blocked": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": None,
    },
    {
        "id": 9008,
        "name": "Sarah Okafor",
        "full_name": "Sarah Okafor",
        "email": "sarah.demo@example.com",
        "platform": "iOS",
        "registered_platform": "ios",
        "registered_app_version": "1.0.6",
        "subscription_tier": "free",
        "access_status": "suspended",
        "trial_days_left": 0,
        "created_at": _iso(_NOW - timedelta(days=55)),
        "last_active_at": _iso(_NOW - timedelta(days=12)),
        "country": "Nigeria",
        "gender": "Female",
        "diabetes_type": "Type 1",
        "goals": ["carb awareness", "quick meals"],
        "dietary_preferences": [],
        "foods_to_avoid": ["dairy"],
        "cuisine_preferences": ["West African"],
        "onboarding_completed": False,
        "is_suspended": True,
        "suspended_at": _iso(_NOW - timedelta(days=3)),
        "deleted_at": None,
    },
    {
        "id": 9009,
        "name": "Tom Williams",
        "full_name": "Tom Williams",
        "email": "tom.demo@example.com",
        "platform": "Android",
        "registered_platform": "android",
        "registered_app_version": "1.0.5",
        "subscription_tier": "free",
        "access_status": "deleted",
        "trial_days_left": 0,
        "created_at": _iso(_NOW - timedelta(days=70)),
        "last_active_at": _iso(_NOW - timedelta(days=20)),
        "country": "United Kingdom",
        "gender": "Male",
        "diabetes_type": "Prediabetes",
        "goals": ["simple ingredients"],
        "dietary_preferences": [],
        "foods_to_avoid": ["alcohol"],
        "cuisine_preferences": ["British/Irish"],
        "onboarding_completed": True,
        "is_suspended": False,
        "suspended_at": None,
        "deleted_at": _iso(_NOW - timedelta(days=1)),
    },
    {
        "id": 9010,
        "name": "Nora Patel",
        "full_name": "Nora Patel",
        "email": "nora.demo@example.com",
        "platform": "iOS",
        "registered_platform": "ios",
        "registered_app_version": "1.0.7",
        "subscription_tier": "free",
        "access_status": "free",
        "trial_days_left": 0,
        "created_at": _iso(_NOW - timedelta(hours=9)),
        "last_active_at": _iso(_NOW - timedelta(hours=3)),
        "country": "United Kingdom",
        "gender": "Female",
        "diabetes_type": "Type 2",
        "goals": ["lower carb"],
        "dietary_preferences": ["pescatarian"],
        "foods_to_avoid": ["chicken"],
        "cuisine_preferences": ["Mediterranean", "South Asian"],
        "onboarding_completed": False,
        "is_suspended": False,
        "suspended_at": None,
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


def _count_by(items: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        value = str(item.get(key) or "unknown").strip().lower()
        counts[value] = counts.get(value, 0) + 1
    return counts


def _demo_users_for_query(query: QueryParams) -> list[dict[str, Any]]:
    users = list(DEMO_USERS)
    tier = str(query.get("tier") or "").strip().lower()
    status = str(query.get("status_filter") or "").strip().lower()
    search = str(query.get("search") or query.get("q") or "").strip().lower()

    if tier:
        if tier in {"trial", "trialing", "store_trial"}:
            users = [user for user in users if str(user.get("access_status") or "").lower() in {"trial", "trialing"}]
        elif tier in {"deleted"}:
            users = [user for user in users if user.get("deleted_at")]
        elif tier in {"expired", "blocked", "suspended", "legacy_grace", "grace", "cancelled_active"}:
            users = [user for user in users if str(user.get("access_status") or "").lower() in {tier, "legacy_grace" if tier == "grace" else tier}]
        else:
            users = [user for user in users if str(user.get("subscription_tier") or "free").lower() == tier]
    if status:
        if status == "active":
            users = [user for user in users if str(user.get("access_status") or "").lower() in {"premium", "trialing", "trial", "cancelled_active", "legacy_grace", "grace"}]
        elif status == "inactive":
            users = [user for user in users if str(user.get("access_status") or "").lower() in {"expired", "free", "blocked", "suspended", "deleted"}]
    if search:
        users = [
            user
            for user in users
            if search in str(user.get("email") or "").lower()
            or search in str(user.get("full_name") or user.get("name") or "").lower()
        ]
    return users


def _demo_platform_summary() -> dict[str, Any]:
    counts = _count_by(DEMO_USERS, "registered_platform")
    ios = counts.get("ios", 0)
    android = counts.get("android", 0)
    unknown = sum(count for key, count in counts.items() if key not in {"ios", "android"})
    return {"ios": ios, "android": android, "unknown": unknown, "total": len(DEMO_USERS), "updated_at": _iso(_NOW)}


def _demo_access_summary() -> dict[str, int]:
    counts = _count_by(DEMO_USERS, "access_status")
    legacy_grace = counts.get("legacy_grace", 0) + counts.get("grace", 0)
    return {
        "trialing": counts.get("trialing", 0) + counts.get("trial", 0),
        "cancelled_active": counts.get("cancelled_active", 0),
        "legacy_grace": legacy_grace,
        "free": counts.get("free", 0),
        "expired": counts.get("expired", 0),
        "premium": counts.get("premium", 0),
        "blocked": counts.get("blocked", 0),
        "suspended": counts.get("suspended", 0),
        "deleted": counts.get("deleted", 0),
        "total": len(DEMO_USERS),
    }


def _demo_user_detail(user_id: int) -> dict[str, Any]:
    user = next((item for item in DEMO_USERS if int(item["id"]) == int(user_id)), DEMO_USERS[0])
    status = str(user.get("access_status") or "free").lower()
    store = "app_store" if user.get("registered_platform") == "ios" else "play_store"
    product_id = "glucoforager_premium_monthly"
    subscription_status = "active" if status in {"premium", "trialing", "cancelled_active"} else status
    detail = dict(user)
    detail.update(
        {
            "status": "active" if status in {"premium", "trialing", "cancelled_active", "legacy_grace"} else "inactive",
            "subscription": user.get("subscription_tier") or "free",
            "premium_access_blocked": bool(user.get("premium_access_blocked")),
            "billing": {
                "store": store,
                "product_id": product_id,
                "latest_status": subscription_status,
                "currency": "GBP",
                "price": 4.99,
                "last_checked_at": _iso(_NOW - timedelta(minutes=4)),
            },
            "admin_comp": None,
            "subscriptions": [
                {
                    "id": int(user["id"]) * 10,
                    "store": store,
                    "plan": "Monthly Premium",
                    "product_id": product_id,
                    "transaction_id": f"demo_txn_{user['id']}",
                    "status": subscription_status,
                    "started_at": user.get("created_at"),
                    "expires_at": user.get("expires_at") or user.get("trial_ends_at") or user.get("trial_grace_ends_at"),
                    "environment": "demo",
                }
            ],
            "activity_summary": {
                "recipes_generated": 24 if status in {"premium", "trialing"} else 5,
                "favorites_saved": 8 if status in {"premium", "trialing"} else 1,
                "last_active_at": user.get("last_active_at"),
            },
        }
    )
    return detail


def _demo_user_growth() -> dict[str, Any]:
    return {
        "week": {
            "label": "current week",
            "items": [
                {"key": "Sun", "label": "Sun", "count": 1},
                {"key": "Mon", "label": "Mon", "count": 2},
                {"key": "Tue", "label": "Tue", "count": 1},
                {"key": "Wed", "label": "Wed", "count": 3},
                {"key": "Thu", "label": "Thu", "count": 2},
                {"key": "Fri", "label": "Fri", "count": 1},
                {"key": "Sat", "label": "Sat", "count": 0},
            ],
        },
        "month": {
            "label": "June 2026",
            "items": [
                {"key": f"2026-06-{day:02d}", "label": str(day), "count": count}
                for day, count in enumerate([0, 1, 0, 2, 1, 3, 2, 0, 1, 2, 1, 0, 3, 1, 2, 4, 1, 0, 2, 1, 3, 2, 1, 0, 1, 2], start=1)
            ],
        },
        "year": {
            "label": "2026",
            "items": [
                {"key": "Jan", "label": "Jan", "count": 7},
                {"key": "Feb", "label": "Feb", "count": 9},
                {"key": "Mar", "label": "Mar", "count": 11},
                {"key": "Apr", "label": "Apr", "count": 14},
                {"key": "May", "label": "May", "count": 18},
                {"key": "Jun", "label": "Jun", "count": 26},
                {"key": "Jul", "label": "Jul", "count": 0},
                {"key": "Aug", "label": "Aug", "count": 0},
                {"key": "Sep", "label": "Sep", "count": 0},
                {"key": "Oct", "label": "Oct", "count": 0},
                {"key": "Nov", "label": "Nov", "count": 0},
                {"key": "Dec", "label": "Dec", "count": 0},
            ],
        },
    }


def get_demo_admin_response(path: str, query: QueryParams, method: str) -> Response | None:
    method = (method or "GET").upper()
    if method not in {"GET", "HEAD", "OPTIONS"}:
        return _json({"detail": "Demo mode is read-only. Actions are disabled for portfolio walkthroughs."}, 403)

    subpath = str(path or "").removeprefix("/api/admin/").strip("/")
    if not subpath or subpath in {"me", "status"} or subpath.startswith("staff/login") or subpath.startswith("staff/refresh"):
        return None

    if subpath == "staff/profile/me":
        return _json(
            {
                "id": 9000,
                "email": "demo@glucoforager.com",
                "timezone": "Europe/London",
                "full_name": "Demo Account",
                "country": "GB",
                "address": "Read-only demo workspace",
                "phone_number": "+44 20 0000 0000",
                "gender": "other",
                "next_of_kin_name": "Demo Contact",
                "next_of_kin_contact": "hello@glucoforager.com",
                "next_of_kin_relationship": "other",
                "next_of_kin_address": "GlucoForager demo environment",
                "avatar_url": None,
                "bank_name": "Demo Bank",
                "bank_account_number": "00000000",
                "bank_account_name": "Demo Account",
                "is_demo": True,
            }
        )
    if subpath == "users/platform-summary":
        return _json(_demo_platform_summary())
    if subpath == "users/access-summary":
        return _json(_demo_access_summary())
    if subpath == "users/growth":
        return _json(_demo_user_growth())
    if subpath == "users":
        users = _demo_users_for_query(query)
        page = max(1, int(query.get("page", 1) or 1))
        page_size = max(1, int(query.get("page_size", len(users)) or len(users)))
        start = (page - 1) * page_size
        return _json({"items": users[start : start + page_size], "total": len(users), "page": page, "page_size": page_size})
    if subpath.startswith("users/"):
        parts = subpath.split("/")
        if len(parts) == 2 and parts[-1].isdigit():
            return _json(_demo_user_detail(int(parts[-1])))
        return _json({"detail": "Demo mode is read-only. Actions are disabled for portfolio walkthroughs."}, 403)

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
    if subpath == "staff-notifications":
        return _json(_items([{"id": 1, "type": "worklog.submitted", "title": "Demo work log submitted", "created_at": _iso(_NOW - timedelta(minutes=35)), "read_at": None}]))
    if subpath == "requests/pending-count":
        return _json({"count": 2})
    if subpath == "user-activity/recent":
        return _json(
            _items(
                [
                    {"id": 1, "user_id": 9001, "user_name": "Amina Clarke", "user_email": "amina.demo@example.com", "event_type": "recipe_generation.completed", "label": "Generated lunch recipes", "source": "mobile", "created_at": _iso(_NOW - timedelta(minutes=14))},
                    {"id": 2, "user_id": 9005, "user_name": "Fatima Yusuf", "user_email": "fatima.demo@example.com", "event_type": "ingredient_scan.completed", "label": "Scanned fridge ingredients", "source": "mobile", "created_at": _iso(_NOW - timedelta(minutes=43))},
                    {"id": 3, "user_id": 9002, "user_name": "Daniel Mensah", "user_email": "daniel.demo@example.com", "event_type": "favorite.created", "label": "Saved a favourite recipe", "source": "mobile", "created_at": _iso(_NOW - timedelta(hours=2))},
                    {"id": 4, "user_id": 9003, "user_name": "Priya Shah", "user_email": "priya.demo@example.com", "event_type": "food_swap.viewed", "label": "Viewed food swaps", "source": "mobile", "created_at": _iso(_NOW - timedelta(hours=4))},
                ]
            )
        )

    if subpath == "revenuecat/overview":
        return _json({"available": True, "currency": "GBP", "metrics": {"revenue": 184.72, "revenue_total": 1288.44}, "message": "Demo RevenueCat overview"})
    if subpath == "ai/recipe-image-usage":
        return _json({"currency": "USD", "today": {"count": 9, "cost_usd": 0.54}, "week": {"count": 41, "cost_usd": 2.46}, "month": {"count": 126, "cost_usd": 7.56}})
    if subpath == "ai/queue-metrics":
        return _json({"backend": "redis", "db": {"counts": {"queued": 0, "running": 1, "failed": 2}}, "redis": {"available": True, "streams": {"text": {"name": "ai:jobs:text", "length": 2, "group": {"pending": 1}}, "vision": {"name": "ai:jobs:vision", "length": 1, "group": {"pending": 0}}}}})
    if subpath == "ai/provider-credits":
        return _json(
            {
                "generated_at": _iso(_NOW - timedelta(minutes=5)),
                "cached_for_seconds": 300,
                "providers": [
                    {"name": "OpenAI", "configured": True, "status": "ok", "currency": "USD", "spend": {"today_usd": 3.18, "month_usd": 91.44}, "usage": {"monthly_total_tokens": 3860000, "monthly_requests": 1420}},
                    {"name": "DeepSeek", "configured": True, "status": "ok", "currency": "USD", "balance": {"total": 12.35}, "usage": {"monthly_total_tokens": 960000, "monthly_requests": 342}},
                    {"name": "Runware", "configured": True, "status": "ok", "currency": "USD", "balance": {"total": 24.8}, "usage": {"today": {"credits": 9, "requests": 9}}},
                ],
            }
        )

    if subpath == "health":
        return _json({"status": "ok", "database": "ok", "redis": "ok", "ai_queue": "ok", "demo": True, "checked_at": _iso(_NOW), "services": {"application": {"status": "ok", "detail": "Demo API snapshot"}, "database": {"status": "ok", "detail": "Seeded data only"}, "cache": {"status": "ok", "detail": "Demo cache healthy"}, "queue": {"status": "ok", "detail": "3 demo jobs", "failed_operational": 2}, "mail": {"status": "ok", "detail": "Sandboxed"}, "storage": {"status": "ok", "detail": "Demo assets"}, "disk": {"status": "ok", "detail": "42% used"}, "cpu": {"status": "ok", "detail": "18% load"}}})
    if subpath == "health/ai-jobs":
        return _json({"items": [], "top_operational_reasons": [], "top_invalid_input_reasons": [], "failed_jobs": []})
    if subpath == "system-logs":
        return _json(_items(DEMO_LOGS))
    if subpath == "mobile-logs":
        return _json(_items(DEMO_MOBILE_LOGS))
    if subpath == "backups":
        return _json(_items([{"filename": "demo-backup-2026-06-25.sql.gz", "size_bytes": 1048576, "created_at": _iso(_NOW - timedelta(hours=6))}]))

    return _json({"detail": "This demo endpoint uses seeded portfolio data only and is not available for this screen."}, 403)

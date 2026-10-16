import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from unittest import mock

from fastapi import HTTPException

from app.api.dependencies import check_user_access, require_ai_feature_access
from app.models.subscription import Subscription
from app.services import free_tier_service


class _Query:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self.items[0] if self.items else None

    def all(self):
        return list(self.items)

    def scalar(self):
        return None


class _DB:
    def __init__(self, subscriptions=None):
        self.subscriptions = subscriptions or []

    def query(self, model, *columns):
        if model is Subscription:
            return _Query(self.subscriptions)
        return _Query([])


def _user(**kwargs):
    defaults = {
        "id": 1,
        "trial_grace_ends_at": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class RequireAiFeatureAccessTest(unittest.TestCase):
    """Every AI endpoint (scan, type-ingredients, swaps, GlucoGuide, daily plan) calls
    require_ai_feature_access before doing any AI work. These tests cover the shared
    gate itself so a change here is caught in one place, regardless of which endpoint
    calls it."""

    def test_blocks_user_with_no_trial_or_subscription(self):
        user = _user()

        with self.assertRaises(HTTPException) as ctx:
            require_ai_feature_access(user, _DB())

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["code"], "trial_expired")
        self.assertTrue(ctx.exception.detail["upgrade"])

    def test_allows_user_with_active_trial_subscription(self):
        now = datetime.utcnow()
        user = _user()
        subscription = Subscription(
            user_id=user.id,
            plan="premium",
            status="trialing",
            started_at=now,
            expires_at=now + timedelta(days=7),
            store="app_store",
        )

        result = require_ai_feature_access(user, _DB([subscription]))

        self.assertTrue(result["has_feature_access"])
        self.assertEqual(result["access_status"], "trialing")

    def test_allows_premium_user(self):
        now = datetime.utcnow()
        user = _user()
        subscription = Subscription(
            user_id=user.id,
            plan="premium",
            status="active",
            started_at=now - timedelta(days=10),
            expires_at=now + timedelta(days=20),
            store="app_store",
        )

        result = require_ai_feature_access(user, _DB([subscription]))

        self.assertTrue(result["has_feature_access"])
        self.assertEqual(result["access_status"], "premium")

    def test_allows_user_in_legacy_grace_window(self):
        user = _user(trial_grace_ends_at=datetime.utcnow() + timedelta(days=14))

        result = require_ai_feature_access(user, _DB())

        self.assertTrue(result["has_feature_access"])
        self.assertEqual(result["access_status"], "legacy_grace")


class CheckUserAccessTest(unittest.TestCase):
    def test_shape_when_denied(self):
        user = _user()

        access = check_user_access(user, _DB())

        self.assertFalse(access["has_feature_access"])
        self.assertFalse(access["is_premium"])
        self.assertEqual(access["access_status"], "expired")
        self.assertIsNotNone(access["detail"])
        self.assertEqual(access["detail"]["code"], "trial_expired")

    def test_shape_when_allowed(self):
        now = datetime.utcnow()
        user = _user()
        subscription = Subscription(
            user_id=user.id,
            plan="premium",
            status="trialing",
            started_at=now,
            expires_at=now + timedelta(days=7),
            store="app_store",
        )

        access = check_user_access(user, _DB([subscription]))

        self.assertTrue(access["has_feature_access"])
        self.assertIsNone(access["detail"])


class FreeTierAccessTest(unittest.TestCase):
    """Users without Premium get a few uses of each AI feature per week before the paywall."""

    def test_allows_free_user_with_uses_left(self):
        user = _user()
        with mock.patch.object(free_tier_service, "get_remaining", return_value=2):
            result = require_ai_feature_access(user, _DB(), feature=free_tier_service.GLUCOGUIDE)

        self.assertFalse(result["has_feature_access"])
        self.assertEqual(result["free_tier_feature"], free_tier_service.GLUCOGUIDE)

    def test_blocks_free_user_with_no_uses_left(self):
        user = _user()
        with mock.patch.object(free_tier_service, "get_remaining", return_value=0):
            with self.assertRaises(HTTPException) as ctx:
                require_ai_feature_access(user, _DB(), feature=free_tier_service.INGREDIENT_SCAN)

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["code"], "free_limit_reached")
        self.assertEqual(ctx.exception.detail["feature"], free_tier_service.INGREDIENT_SCAN)
        self.assertEqual(ctx.exception.detail["limit"], 2)
        self.assertTrue(ctx.exception.detail["upgrade"])

    def test_premium_only_feature_never_uses_free_tier(self):
        # The daily meal planner passes no feature, so free users are always blocked.
        user = _user()
        with mock.patch.object(free_tier_service, "get_remaining", return_value=99):
            with self.assertRaises(HTTPException) as ctx:
                require_ai_feature_access(user, _DB())

        self.assertEqual(ctx.exception.detail["code"], "trial_expired")

    def test_welcome_week_user_is_unlimited_and_uncounted(self):
        user = _user(trial_grace_ends_at=datetime.utcnow() + timedelta(days=7))
        with mock.patch.object(free_tier_service, "get_remaining", return_value=0):
            result = require_ai_feature_access(user, _DB(), feature=free_tier_service.SWAPS)

        self.assertTrue(result["has_feature_access"])
        self.assertNotIn("free_tier_feature", result)
        self.assertIsNone(result["free_usage"])

    def test_denied_access_reports_weekly_free_usage(self):
        access = check_user_access(_user(), _DB())

        usage = access["free_usage"]
        self.assertEqual(usage["features"][free_tier_service.GLUCOGUIDE], {"limit": 3, "used": 0, "remaining": 3})
        self.assertNotIn("daily_plan", usage["features"])


if __name__ == "__main__":
    unittest.main()

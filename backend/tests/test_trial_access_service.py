import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.subscription import Subscription
from app.services.trial_access_service import get_access_snapshot, start_trial_for_new_user


class _Query:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self.items[0] if self.items else None


class _DB:
    def __init__(self, subscriptions=None):
        self.subscriptions = subscriptions or []

    def query(self, model):
        if model is Subscription:
            return _Query(self.subscriptions)
        return _Query([])


def _user(**kwargs):
    defaults = {
        "id": 1,
        "subscription_tier": "free",
        "trial_started_at": None,
        "trial_ends_at": None,
        "trial_grace_ends_at": None,
        "premium_access_blocked_at": None,
        "premium_access_blocked_until": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TrialAccessServiceTest(unittest.TestCase):
    def test_backend_trial_no_longer_grants_new_user_access(self):
        now = datetime(2026, 6, 6, 12, 0, 0)
        user = _user()

        start_trial_for_new_user(user, now=now)
        snapshot = get_access_snapshot(_DB(), user, now=now)

        self.assertFalse(snapshot.allowed)
        self.assertEqual(snapshot.access_status, "expired")
        self.assertIsNone(user.trial_started_at)
        self.assertIsNone(user.trial_ends_at)

    def test_store_trialing_subscription_is_allowed(self):
        now = datetime(2026, 6, 6, 12, 0, 0)
        user = _user()
        subscription = Subscription(
            user_id=user.id,
            plan="premium",
            status="trialing",
            started_at=now,
            expires_at=now + timedelta(days=7),
            store="app_store",
        )

        snapshot = get_access_snapshot(_DB([subscription]), user, now=now)

        self.assertTrue(snapshot.allowed)
        self.assertTrue(snapshot.is_premium)
        self.assertEqual(snapshot.access_status, "trialing")
        self.assertEqual(snapshot.trial_days_left, 7)

    def test_cancelled_store_subscription_remains_active_until_expiry(self):
        now = datetime(2026, 6, 6, 12, 0, 0)
        user = _user()
        subscription = Subscription(
            user_id=user.id,
            plan="premium",
            status="cancelled",
            started_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=3),
            store="play_store",
        )

        snapshot = get_access_snapshot(_DB([subscription]), user, now=now)

        self.assertTrue(snapshot.allowed)
        self.assertTrue(snapshot.is_premium)
        self.assertEqual(snapshot.access_status, "cancelled_active")
        self.assertEqual(snapshot.trial_days_left, 3)

    def test_expired_trial_stays_blocked_for_same_account(self):
        now = datetime(2026, 6, 20, 12, 0, 0)
        user = _user(
            trial_started_at=now - timedelta(days=14),
            trial_ends_at=now - timedelta(days=7),
            trial_grace_ends_at=None,
        )
        first_check = get_access_snapshot(_DB(), user, now=now)
        second_check = get_access_snapshot(_DB(), user, now=now)

        self.assertFalse(first_check.allowed)
        self.assertFalse(second_check.allowed)
        self.assertEqual(first_check.access_status, "expired")
        self.assertEqual(second_check.access_status, "expired")

    def test_existing_user_grace_window_is_allowed(self):
        now = datetime(2026, 6, 6, 12, 0, 0)
        user = _user(trial_grace_ends_at=now + timedelta(days=14))

        snapshot = get_access_snapshot(_DB(), user, now=now)

        self.assertTrue(snapshot.allowed)
        self.assertEqual(snapshot.access_status, "legacy_grace")
        self.assertEqual(snapshot.trial_days_left, 14)

    def test_premium_subscription_overrides_expired_trial(self):
        now = datetime(2026, 6, 20, 12, 0, 0)
        user = _user(
            trial_started_at=now - timedelta(days=14),
            trial_ends_at=now - timedelta(days=7),
        )
        subscription = Subscription(
            user_id=user.id,
            plan="premium",
            status="active",
            started_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=30),
            store="app_store",
        )

        snapshot = get_access_snapshot(_DB([subscription]), user, now=now)

        self.assertTrue(snapshot.allowed)
        self.assertTrue(snapshot.is_premium)
        self.assertEqual(snapshot.access_status, "premium")

    def test_start_trial_does_not_extend_existing_trial(self):
        now = datetime(2026, 6, 6, 12, 0, 0)
        original_end = now + timedelta(days=2)
        user = _user(trial_started_at=now - timedelta(days=5), trial_ends_at=original_end)

        start_trial_for_new_user(user, now=now)

        self.assertEqual(user.trial_ends_at, original_end)


if __name__ == "__main__":
    unittest.main()

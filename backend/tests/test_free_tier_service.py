"""Free-tier weekly usage. The counter uses a Postgres upsert, so the DB tests need a real
Postgres: set TEST_DATABASE_URL (a throwaway database - tables are created and dropped)."""

import os
import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from app.services import free_tier_service as ft


class WeekBoundaryTest(unittest.TestCase):
    def test_week_starts_monday_and_resets_next_monday(self):
        wednesday = datetime(2026, 10, 14, 15, 30)
        self.assertEqual(ft.week_start(wednesday), date(2026, 10, 12))
        self.assertEqual(ft.week_resets_at(wednesday), datetime(2026, 10, 19))

    def test_monday_belongs_to_its_own_week(self):
        monday = datetime(2026, 10, 19, 0, 0, 1)
        self.assertEqual(ft.week_start(monday), date(2026, 10, 19))

    def test_limit_message_names_feature_and_count(self):
        detail = ft.free_limit_detail(ft.RECIPE_GENERATION, now=datetime(2026, 10, 14))
        self.assertEqual(detail["code"], "free_limit_reached")
        self.assertIn("3 free recipe generations", detail["message"])
        self.assertEqual(detail["resets_at"], "2026-10-19T00:00:00Z")


class WelcomeWeekTest(unittest.TestCase):
    def test_starts_seven_day_window(self):
        now = datetime(2026, 10, 16, 12, 0)
        user = SimpleNamespace(trial_grace_ends_at=None)
        ft.start_welcome_week(user, now=now)
        self.assertEqual(user.trial_grace_ends_at, now + timedelta(days=7))

    def test_never_shortens_a_longer_window(self):
        now = datetime(2026, 10, 16, 12, 0)
        longer = now + timedelta(days=30)
        user = SimpleNamespace(trial_grace_ends_at=longer)
        ft.start_welcome_week(user, now=now)
        self.assertEqual(user.trial_grace_ends_at, longer)


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class RecordUsePostgresTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401  (register all tables)

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.drop_all(cls.engine)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        from app.database import Base

        Base.metadata.drop_all(cls.engine)

    def setUp(self):
        from app.models.user import User

        self.db = self.Session()
        self.user = User(email=f"t{datetime.utcnow().timestamp()}@example.com", hashed_password="x", public_id=str(datetime.utcnow().timestamp()))
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_counts_per_feature_and_week(self):
        uid = self.user.id
        now = datetime(2026, 10, 14, 10, 0)
        ft.record_use(self.db, uid, ft.GLUCOGUIDE, now=now)
        ft.record_use(self.db, uid, ft.GLUCOGUIDE, now=now)
        ft.record_use(self.db, uid, ft.SWAPS, now=now)

        self.assertEqual(ft.get_used(self.db, uid, ft.GLUCOGUIDE, now=now), 2)
        self.assertEqual(ft.get_remaining(self.db, uid, ft.GLUCOGUIDE, now=now), 1)
        self.assertEqual(ft.get_remaining(self.db, uid, ft.SWAPS, now=now), 2)
        # Next week starts fresh.
        next_week = now + timedelta(days=7)
        self.assertEqual(ft.get_remaining(self.db, uid, ft.GLUCOGUIDE, now=next_week), 3)

    def test_summary_never_reports_negative_remaining(self):
        uid = self.user.id
        now = datetime(2026, 10, 14, 10, 0)
        for _ in range(5):
            ft.record_use(self.db, uid, ft.INGREDIENT_SCAN, now=now)
        summary = ft.usage_summary(self.db, uid, now=now)
        self.assertEqual(summary["features"][ft.INGREDIENT_SCAN], {"limit": 3, "used": 3, "remaining": 0})

    def test_record_use_if_free_skips_users_with_access(self):
        self.user.trial_grace_ends_at = datetime.utcnow() + timedelta(days=7)
        self.db.commit()
        ft.record_use_if_free(self.db, self.user, ft.GLUCOGUIDE)
        self.assertEqual(ft.get_used(self.db, self.user.id, ft.GLUCOGUIDE), 0)

        self.user.trial_grace_ends_at = None
        self.db.commit()
        ft.record_use_if_free(self.db, self.user.id, ft.GLUCOGUIDE)  # also accepts a user id
        self.assertEqual(ft.get_used(self.db, self.user.id, ft.GLUCOGUIDE), 1)


if __name__ == "__main__":
    unittest.main()

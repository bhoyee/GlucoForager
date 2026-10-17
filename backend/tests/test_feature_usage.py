"""Admin feature-usage summary: counts real feature uses (not raw event rows).
Needs a real database: set TEST_DATABASE_URL (a throwaway Postgres)."""

import os
import unittest
from datetime import datetime, timedelta


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class FeatureUsageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        from app.models.user import User
        from app.models.user_activity_event import UserActivityEvent

        self.db = self.Session()
        self.db.query(UserActivityEvent).delete()
        stamp = str(datetime.utcnow().timestamp())
        self.u1 = User(email=f"fu1{stamp}@example.com", hashed_password="x", public_id=f"fu1{stamp}")
        self.u2 = User(email=f"fu2{stamp}@example.com", hashed_password="x", public_id=f"fu2{stamp}")
        self.db.add_all([self.u1, self.u2])
        self.db.commit()

        now = datetime.utcnow()
        last_week = now - timedelta(days=9)

        def ev(user, event_type, when, meta=None):
            self.db.add(UserActivityEvent(user_id=user.id, event_type=event_type, label="x", metadata_json=meta, created_at=when))

        # One recipe generation = started + running + completed: must count once.
        for t in ("recipe_generation.started", "recipe_generation.running", "recipe_generation.completed"):
            ev(self.u1, t, now)
        ev(self.u2, "recipe_generation.started", now)
        # GlucoGuide via ai.request; recipe images must not count as anything.
        ev(self.u1, "ai.request", now, {"request_type": "agent"})
        ev(self.u1, "ai.request", now, {"request_type": "recipe_image"})
        ev(self.u1, "barcode.scanned", now, {"found": True})
        ev(self.u1, "push_token.updated", now)
        # Previous period: one recipe generation.
        ev(self.u1, "recipe_generation.started", last_week)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_counts_features_not_raw_events(self):
        from app.api.endpoints.admin_user_activity import feature_usage

        data = feature_usage(days=7, db=self.db, current_staff=None)
        by_key = {f["key"]: f for f in data["features"]}

        self.assertEqual(by_key["recipes"]["uses"], 2)
        self.assertEqual(by_key["recipes"]["users"], 2)
        self.assertEqual(by_key["recipes"]["prev_uses"], 1)
        self.assertEqual(by_key["recipes"]["change_pct"], 100)
        self.assertEqual(by_key["glucoguide"]["uses"], 1)
        self.assertEqual(by_key["barcode"]["uses"], 1)
        self.assertEqual(data["active_users"], 2)
        # Ranked by uses; recipe images / push tokens counted nowhere.
        self.assertEqual(data["features"][0]["key"], "recipes")
        self.assertEqual(sum(f["uses"] for f in data["features"]), 4)
        self.assertEqual(len(data["dates"]), 7)
        self.assertEqual(sum(data["series"]["recipes"]), 2)

    def test_unsupported_range_falls_back_to_7_days(self):
        from app.api.endpoints.admin_user_activity import feature_usage

        self.assertEqual(feature_usage(days=90, db=self.db, current_staff=None)["days"], 7)
        self.assertEqual(feature_usage(days=30, db=self.db, current_staff=None)["days"], 30)


if __name__ == "__main__":
    unittest.main()

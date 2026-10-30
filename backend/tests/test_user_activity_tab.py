"""Admin user page Activity tab: one user's timeline (paged in the database, technical
steps hidden, filterable by feature) and a per-feature usage summary.
Needs a real database: set TEST_DATABASE_URL (a throwaway Postgres)."""

import os
import unittest
from datetime import datetime, timedelta


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class UserActivityTabTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

        from app.models.user import User
        from app.models.user_activity_event import UserActivityEvent

        db = cls.Session()
        stamp = str(datetime.utcnow().timestamp()).replace(".", "")
        user = User(email=f"ua-{stamp}@example.com", hashed_password="x", public_id=f"ua{stamp}", subscription_tier="free")
        db.add(user)
        db.flush()
        now = datetime.utcnow()
        events = [
            ("auth.login", "Signed in", None, 0),
            ("recipe_generation.started", "Started recipe generation", None, 1),
            ("recipe_generation.running", "Recipe generation started", None, 2),
            ("ai.request", "Used text AI", {"request_type": "text"}, 3),
            ("recipe_generation.completed", "Generated recipes", None, 4),
            ("ai.request", "Generated recipe image", {"request_type": "recipe_image"}, 5),
            ("ai.request", "Asked GlucoGuide AI", {"request_type": "agent"}, 6),
            ("ai.request", "Asked GlucoGuide AI", {"request_type": "agent"}, 7),
            ("glucose_reading.created", "Logged a glucose reading", None, 60 * 24 * 2),
            ("push_token.updated", "Updated notification token", None, 9),
        ]
        for event_type, label, meta, minutes_ago in events:
            db.add(UserActivityEvent(user_id=user.id, event_type=event_type, label=label, source="mobile",
                                     metadata_json=meta, created_at=now - timedelta(minutes=minutes_ago)))
        db.commit()
        cls.user_id = user.id
        db.close()

    def _timeline(self, **kw):
        from app.api.endpoints.admin_user_activity import user_activity_timeline

        db = self.Session()
        try:
            return user_activity_timeline(self.user_id, db=db, current_staff=None, **{"page": 1, "page_size": 25, "feature": None, "include_technical": False, **kw})
        finally:
            db.close()

    def test_technical_steps_are_hidden_by_default(self):
        data = self._timeline()
        types = [i["event_type"] for i in data["items"]]
        self.assertEqual(data["total"], 6)
        self.assertNotIn("recipe_generation.running", types)
        self.assertNotIn("push_token.updated", types)
        self.assertFalse(any(i["metadata"].get("request_type") in ("recipe_image", "text") for i in data["items"]))
        self.assertEqual(self._timeline(include_technical=True)["total"], 10)

    def test_paging_and_newest_first(self):
        first = self._timeline(page_size=4)
        second = self._timeline(page=2, page_size=4)
        self.assertEqual(len(first["items"]), 4)
        self.assertEqual(len(second["items"]), 2)
        self.assertEqual(first["items"][0]["event_type"], "auth.login")
        self.assertEqual(second["items"][-1]["event_type"], "glucose_reading.created")

    def test_feature_filter_covers_ai_requests_and_plain_events(self):
        guide = self._timeline(feature="glucoguide")
        self.assertEqual(guide["total"], 2)
        self.assertEqual({i["label"] for i in guide["items"]}, {"Asked GlucoGuide AI"})
        self.assertEqual(self._timeline(feature="recipes")["total"], 2)  # started + completed
        self.assertEqual(self._timeline(feature="nope")["total"], 0)

    def test_summary_counts_one_use_per_action(self):
        from app.api.endpoints.admin_user_activity import user_activity_summary

        db = self.Session()
        try:
            data = user_activity_summary(self.user_id, days=30, db=db, current_staff=None)
        finally:
            db.close()
        uses = {f["key"]: f["uses"] for f in data["features"]}
        self.assertEqual(uses, {"glucoguide": 2, "recipes": 1, "glucose": 1, "account": 1})
        self.assertEqual(data["top_feature"], "GlucoGuide AI")
        self.assertEqual(data["active_days"], 2)
        self.assertEqual(data["actions"], 6)


if __name__ == "__main__":
    unittest.main()

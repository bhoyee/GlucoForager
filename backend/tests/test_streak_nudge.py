"""Streak nudges reach every enabled device of users with a streak at risk.
Needs a real database: set TEST_DATABASE_URL (a throwaway Postgres) - the bug this
guards against (SELECT DISTINCT over users' JSON columns) only shows up on Postgres."""

import os
import unittest
from datetime import datetime
from unittest import mock


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class StreakNudgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def test_job_runs_and_targets_each_enabled_token_once(self):
        from app.models.push_token import PushToken
        from app.models.user import User
        from app.services import streak_nudge_scheduler as job
        from app.services.expo_push_service import ExpoPushResult

        db = self.Session()
        stamp = str(datetime.utcnow().timestamp()).replace(".", "")
        user = User(
            email=f"sn-{stamp}@example.com", hashed_password="x", public_id=f"sn{stamp}", subscription_tier="free",
            detected_countries=["GB"], preferred_cuisines=["british"],  # JSON columns that broke DISTINCT
        )
        db.add(user)
        db.flush()
        for i, enabled in enumerate((True, True, False)):
            db.add(PushToken(user_id=user.id, provider="expo", token=f"ExponentPushToken[sn{stamp}{i}]", enabled=enabled))
        db.commit()
        user_id = user.id
        db.close()

        sent = []

        def fake_send(messages):
            sent.extend(messages)
            return ExpoPushResult(success_count=len(messages), failure_count=0, failures=[])

        with mock.patch.object(job, "get_streak_days", side_effect=lambda db, user, up_to: 3 if user.id == user_id else 0), \
             mock.patch.object(job, "send_expo_push_messages", side_effect=fake_send):
            result = job.run_streak_nudge_job()

        mine = sorted(m["to"] for m in sent if f"sn{stamp}" in m["to"])
        self.assertEqual(mine, [f"ExponentPushToken[sn{stamp}0]", f"ExponentPushToken[sn{stamp}1]"])
        self.assertGreaterEqual(result["eligible"], 1)


if __name__ == "__main__":
    unittest.main()

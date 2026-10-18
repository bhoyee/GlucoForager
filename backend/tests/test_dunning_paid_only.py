"""Win-back emails go only to people who actually paid and then left.
Needs a real database: set TEST_DATABASE_URL (a throwaway Postgres)."""

import os
import unittest
from datetime import datetime, timedelta
from unittest import mock


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class DunningPaidOnlyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401
        import app.models.dunning_email_template  # noqa: F401  (not in app.models)
        import app.models.dunning_email_log  # noqa: F401
        import app.models.subscription_event  # noqa: F401

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def _user(self, db, tag, events):
        from app.models.subscription import Subscription
        from app.models.subscription_event import SubscriptionEvent
        from app.models.user import User

        stamp = f"{tag}{datetime.utcnow().timestamp()}"
        user = User(email=f"wb-{stamp}@example.com", hashed_password="x", public_id=f"wb{stamp}", subscription_tier="free")
        db.add(user)
        db.flush()
        expired = datetime.utcnow() - timedelta(days=3)
        sub = Subscription(user_id=user.id, plan="free", status="expired", store="PLAY_STORE",
                           started_at=expired - timedelta(days=30), expires_at=expired)
        db.add(sub)
        db.flush()
        for event_type, period_type, price, env in events:
            db.add(SubscriptionEvent(user_id=user.id, subscription_id=sub.id, event_type=event_type, plan="premium",
                                     status="active", period_type=period_type, price_usd=price, environment=env,
                                     occurred_at=expired - timedelta(days=20)))
        return user

    def test_only_paid_users_get_winback(self):
        from app.services import dunning_scheduler

        db = self.Session()
        paid = self._user(db, "paid", [("INITIAL_PURCHASE", "NORMAL", 9.99, "PRODUCTION")])
        trial = self._user(db, "trial", [("INITIAL_PURCHASE", "TRIAL", 0, "PRODUCTION"), ("EXPIRATION", "TRIAL", 0, "PRODUCTION")])
        sandbox = self._user(db, "sandbox", [("INITIAL_PURCHASE", "NORMAL", 9.99, "SANDBOX")])
        db.commit()
        ids = {paid.id: "paid", trial.id: "trial", sandbox.id: "sandbox"}
        db.close()

        sent_to = []
        with mock.patch.object(dunning_scheduler, "send_dunning_template_email",
                               side_effect=lambda email, name, user_id, **kw: sent_to.append(user_id) or "id"):
            dunning_scheduler.run_dunning_job()

        self.assertEqual([ids[u] for u in sent_to if u in ids], ["paid"])


if __name__ == "__main__":
    unittest.main()

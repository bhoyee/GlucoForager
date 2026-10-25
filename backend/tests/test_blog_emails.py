"""Blog post emails: a teaser with a link (never the whole article), an unsubscribe link
for app users, and the right people left out."""

import os
import unittest
from datetime import datetime

from app.services.email_service import render_blog_post_newsletter_email, render_blog_post_to_user_email

POST = dict(
    post_title="Can Diabetics Eat Watermelon?",
    post_excerpt="<p>Yes, in sensible portions &amp; with protein.</p>",
    post_url="https://www.glucoforager.com/blog/can-diabetics-eat-watermelon",
    image_url="https://cdn.example.com/w.jpg",
)


class RenderTest(unittest.TestCase):
    def test_user_email_is_a_teaser_with_read_link_and_unsubscribe(self):
        subject, html = render_blog_post_to_user_email(user_id=7, to_email="a@example.com", **POST)
        self.assertEqual(subject, "New on GlucoForager: Can Diabetics Eat Watermelon?")
        self.assertIn("Yes, in sensible portions &amp; with protein.", html)  # excerpt, tags stripped, not double-escaped
        self.assertIn('href="https://www.glucoforager.com/blog/can-diabetics-eat-watermelon"', html)
        self.assertIn("Read the full article", html)
        self.assertIn("/unsubscribe?type=dunning&amp;token=", html)

    def test_newsletter_email_keeps_its_unsubscribe_link(self):
        _, html = render_blog_post_newsletter_email(unsubscribe_url="https://x.test/unsubscribe?token=abc", **POST)
        self.assertIn("https://x.test/unsubscribe?token=abc", html)


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class RecipientsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def test_all_users_skips_unsubscribed_deleted_suspended_and_excluded(self):
        from app.api.endpoints.admin_blog import _user_recipients
        from app.models.user import User

        db = self.Session()
        stamp = str(datetime.utcnow().timestamp()).replace(".", "")

        def user(tag, **kw):
            u = User(email=f"be-{tag}-{stamp}@example.com", hashed_password="x", public_id=f"be{tag}{stamp}", subscription_tier="free", **kw)
            db.add(u)
            return u

        user("ok")
        user("optout", dunning_opt_out=True)
        user("deleted", deleted_at=datetime.utcnow())
        user("suspended", suspended_at=datetime.utcnow())
        if not db.query(User).filter(User.email == "missblair26@gmail.com").first():
            db.add(User(email="missblair26@gmail.com", hashed_password="x", public_id=f"bemb{stamp}", subscription_tier="free"))
        db.commit()

        emails = {e for _, e in _user_recipients(db)}
        mine = {e.split("-")[1] for e in emails if e.endswith(f"-{stamp}@example.com")}
        self.assertEqual(mine, {"ok"})
        self.assertNotIn("missblair26@gmail.com", emails)
        db.close()


if __name__ == "__main__":
    unittest.main()

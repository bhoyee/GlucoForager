"""Friday update / welcome-week relaunch email: the right promise, links and opt-out."""

import unittest

from app.services.email_service import render_welcome_week_relaunch_email


class FridayUpdateEmailTest(unittest.TestCase):
    def test_content_links_and_unsubscribe(self):
        subject, html = render_welcome_week_relaunch_email("sam@example.com", "Sam Carter", 7, welcome_days=7)
        self.assertEqual(subject, "Your Friday update: a new GlucoForager (and 7 days of Premium on us)")
        self.assertIn("Hi Sam,", html)
        self.assertIn("7 days of Premium, on us", html)
        self.assertIn("no card on file", html)
        self.assertIn("/download", html)
        self.assertIn("/unsubscribe?type=dunning&amp;token=", html)
        self.assertNotIn("home-hero.png", html)  # no phone screenshots: keeps it short on mobile

    def test_unknown_name_and_other_lengths(self):
        subject, html = render_welcome_week_relaunch_email("x@example.com", None, 8, welcome_days=14)
        self.assertIn("14 days of Premium", subject)
        self.assertIn("Hi there,", html)


if __name__ == "__main__":
    unittest.main()

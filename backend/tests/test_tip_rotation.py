"""Personal tips: at most twice a week, 3 days apart, and a different food each time."""

import unittest
from datetime import date, timedelta

from app.services.tip_extras import _personal_slot


class PersonalTipRotationTest(unittest.TestCase):
    def test_two_personal_days_in_every_week(self):
        for user_id in range(1, 15):
            start = date(2026, 10, 1)
            for offset in range(30):
                week = [start + timedelta(days=offset + i) for i in range(7)]
                slots = [_personal_slot(user_id, d) for d in week]
                self.assertEqual(sum(s is not None for s in slots), 2, (user_id, week[0]))

    def test_personal_days_are_three_apart_and_slots_count_up(self):
        days = [date(2026, 10, 1) + timedelta(days=i) for i in range(28)]
        hits = [(d, _personal_slot(7, d)) for d in days if _personal_slot(7, d) is not None]
        slots = [s for _, s in hits]
        self.assertEqual(slots, list(range(slots[0], slots[0] + len(slots))))  # new food each time
        gaps = {(b[0] - a[0]).days for a, b in zip(hits, hits[1:])}
        self.assertEqual(gaps, {3, 4})

    def test_users_are_spread_over_the_week(self):
        day = date(2026, 10, 23)
        on_today = [u for u in range(1, 71) if _personal_slot(u, day) is not None]
        self.assertTrue(10 <= len(on_today) <= 30)  # ~2/7 of users, not everyone at once


if __name__ == "__main__":
    unittest.main()

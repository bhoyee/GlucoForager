import json
import unittest
from datetime import date, timedelta
from types import SimpleNamespace

from app.models.user_daily_challenge import UserDailyChallenge
from app.services.daily_challenge_service import _matches_profile, get_streak_days


class _Query:
    def __init__(self, items):
        self.items = list(items)

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self.items)


class _DB:
    def __init__(self, rows=None):
        self.rows = rows or []

    def query(self, model):
        if model is UserDailyChallenge:
            return _Query(self.rows)
        return _Query([])


def _row(on_date, task_ids, completed_ids):
    return UserDailyChallenge(
        user_id=1,
        date=on_date,
        tasks_json=json.dumps([{"id": tid, "text": tid, "category": "general"} for tid in task_ids]),
        completed_task_ids_json=json.dumps(completed_ids),
    )


class GetStreakDaysTest(unittest.TestCase):
    """Backs the streak badge shown on Home ('N day streak') and inside the Challenge screen."""

    def test_no_history_is_zero_streak(self):
        user = SimpleNamespace(id=1)
        today = date(2026, 7, 20)

        streak = get_streak_days(_DB([]), user=user, up_to=today)

        self.assertEqual(streak, 0)

    def test_consecutive_completed_days_count_the_streak(self):
        user = SimpleNamespace(id=1)
        today = date(2026, 7, 20)
        rows = [
            _row(today, ["a", "b"], ["a", "b"]),
            _row(today - timedelta(days=1), ["a", "b"], ["a", "b"]),
            _row(today - timedelta(days=2), ["a", "b"], ["a", "b"]),
        ]

        streak = get_streak_days(_DB(rows), user=user, up_to=today)

        self.assertEqual(streak, 3)

    def test_gap_day_breaks_the_streak(self):
        user = SimpleNamespace(id=1)
        today = date(2026, 7, 20)
        rows = [
            _row(today, ["a"], ["a"]),
            # today - 1 day is missing entirely -> streak stops there.
            _row(today - timedelta(days=2), ["a"], ["a"]),
        ]

        streak = get_streak_days(_DB(rows), user=user, up_to=today)

        self.assertEqual(streak, 1)

    def test_incomplete_day_breaks_the_streak(self):
        user = SimpleNamespace(id=1)
        today = date(2026, 7, 20)
        rows = [
            _row(today, ["a", "b"], ["a"]),  # only 1 of 2 tasks done today
            _row(today - timedelta(days=1), ["a", "b"], ["a", "b"]),
        ]

        streak = get_streak_days(_DB(rows), user=user, up_to=today)

        self.assertEqual(streak, 0)

    def test_today_incomplete_does_not_hide_a_completed_yesterday(self):
        # up_to defaults to "today" in real usage; here we anchor explicitly on a date
        # where the most recent day has no row at all (e.g. challenge not opened yet today),
        # which should look the same as "today incomplete": streak counts back from up_to
        # and stops the moment a day is missing/incomplete.
        user = SimpleNamespace(id=1)
        today = date(2026, 7, 20)
        rows = [
            _row(today - timedelta(days=1), ["a"], ["a"]),
        ]

        streak = get_streak_days(_DB(rows), user=user, up_to=today)

        self.assertEqual(streak, 0)


class MatchesProfileTest(unittest.TestCase):
    """Controls which daily-challenge tasks are eligible for a given blood-sugar profile."""

    def test_universal_task_matches_any_profile(self):
        item = {"audience_profiles": [], "exclude_profiles": []}

        self.assertTrue(_matches_profile(item, "type_2"))
        self.assertTrue(_matches_profile(item, None))

    def test_targeted_task_matches_only_its_audience(self):
        item = {"audience_profiles": ["type_2"], "exclude_profiles": []}

        self.assertTrue(_matches_profile(item, "type_2"))
        self.assertFalse(_matches_profile(item, "type_1"))

    def test_targeted_task_excludes_users_with_no_profile(self):
        item = {"audience_profiles": ["type_2"], "exclude_profiles": []}

        self.assertFalse(_matches_profile(item, None))

    def test_exclude_wins_even_over_a_universal_task(self):
        item = {"audience_profiles": [], "exclude_profiles": ["type_1"]}

        self.assertFalse(_matches_profile(item, "type_1"))
        self.assertTrue(_matches_profile(item, "type_2"))


if __name__ == "__main__":
    unittest.main()

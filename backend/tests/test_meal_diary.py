import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.services import glucose_targets as gt
from app.services.meal_diary import build_diary

T0 = datetime(2026, 10, 18, 12, 0)


def meal(id, minutes, desc="meal"):
    return SimpleNamespace(id=id, description=desc, logged_at=T0 + timedelta(minutes=minutes))


def reading(id, minutes, value, context=None):
    return SimpleNamespace(id=id, value_mg_dl=value, context=context, logged_at=T0 + timedelta(minutes=minutes))


def ser_meal(m):
    return {"id": m.id, "description": m.description}


def ser_reading(r):
    return {"id": r.id, "value_mg_dl": r.value_mg_dl, "context": r.context}


def diary(meals, readings, targets=gt.GlucoseTargets()):
    return build_diary(meals, readings, targets, ser_meal, ser_reading)


class MealDiaryTest(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(diary([], []), [])

    def test_meal_without_readings(self):
        items = diary([meal(1, 0)], [])
        self.assertEqual(items[0]["kind"], "meal")
        self.assertIsNone(items[0]["after"])
        self.assertIsNone(items[0]["before"])

    def test_readings_without_meals_are_standalone_and_judged(self):
        items = diary([], [reading(1, 0, 200), reading(2, 60, 100, "fasting")])
        self.assertEqual([i["kind"] for i in items], ["glucose", "glucose"])
        self.assertEqual(items[0]["status"], gt.IN_RANGE)  # 100 fasting
        self.assertEqual(items[1]["status"], gt.ABOVE)     # 200 untagged

    def test_after_reading_judged_as_post_meal_even_if_untagged(self):
        items = diary([meal(1, 0)], [reading(1, 120, 165)])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["after"]["status"], gt.IN_RANGE)  # <180 after meals
        self.assertEqual(items[0]["after"]["target_high"], 180)

    def test_too_soon_and_too_late_readings_stay_standalone(self):
        items = diary([meal(1, 0)], [reading(1, 20, 150), reading(2, 200, 150)])
        m = next(i for i in items if i["kind"] == "meal")
        self.assertIsNone(m["after"])
        self.assertEqual(sum(i["kind"] == "glucose" for i in items), 2)

    def test_picks_reading_closest_to_two_hours(self):
        items = diary([meal(1, 0)], [reading(1, 45, 190), reading(2, 115, 160), reading(3, 170, 140)])
        m = next(i for i in items if i["kind"] == "meal")
        self.assertEqual(m["after"]["id"], 2)
        self.assertEqual(sum(i["kind"] == "glucose" for i in items), 2)

    def test_reading_belongs_to_latest_meal(self):
        items = diary([meal(1, 0), meal(2, 40)], [reading(1, 120, 170)])
        by_id = {i["id"]: i for i in items if i["kind"] == "meal"}
        self.assertEqual(by_id[2]["after"]["id"], 1)
        self.assertIsNone(by_id[1]["after"])

    def test_before_reading_and_rise(self):
        items = diary([meal(1, 0)], [reading(1, -20, 110), reading(2, 120, 165)])
        m = items[0]
        self.assertEqual(m["before"]["value_mg_dl"], 110)
        self.assertEqual(m["before"]["status"], gt.IN_RANGE)  # untagged before -> 80-130
        self.assertEqual(m["rise_mg_dl"], 55)
        self.assertEqual(len(items), 1)

    def test_tagged_contexts_respected(self):
        # A fasting/before-meal tag is never an "after" reading; an after-meal tag never "before".
        items = diary([meal(1, 0)], [reading(1, 90, 120, "before_meal"), reading(2, -10, 150, "after_meal")])
        m = next(i for i in items if i["kind"] == "meal")
        self.assertIsNone(m["after"])
        self.assertIsNone(m["before"])

    def test_one_reading_not_used_twice(self):
        # 120 min after meal 1 and 30 min before meal 2: used as meal 1's after reading only.
        items = diary([meal(1, 0), meal(2, 150)], [reading(1, 120, 150)])
        by_id = {i["id"]: i for i in items if i["kind"] == "meal"}
        self.assertEqual(by_id[1]["after"]["id"], 1)
        self.assertIsNone(by_id[2]["before"])

    def test_personal_targets_used(self):
        targets = gt.GlucoseTargets(premeal_low=80, premeal_high=130, postmeal_high=160, is_default=False)
        items = diary([meal(1, 0)], [reading(1, 120, 165)], targets)
        self.assertEqual(items[0]["after"]["status"], gt.ABOVE)
        self.assertEqual(items[0]["after"]["delta_mg_dl"], 5)

    def test_newest_first(self):
        items = diary([meal(1, 0), meal(2, 600)], [reading(1, 300, 120)])
        self.assertEqual([(i["kind"], i["id"]) for i in items], [("meal", 2), ("glucose", 1), ("meal", 1)])


if __name__ == "__main__":
    unittest.main()

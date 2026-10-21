import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.services import glucose_targets as gt
from app.services.glucose_insights import build_insights, food_key

T0 = datetime(2026, 10, 1, 12, 0)  # a Thursday, 12:00 UTC
_ids = iter(range(1, 100000))


def meal(day, hour, desc, carbs=None):
    return SimpleNamespace(id=next(_ids), description=desc, carbs_g=carbs, logged_at=T0 + timedelta(days=day, hours=hour - 12))


def reading(day, hour, value, context=None):
    return SimpleNamespace(id=next(_ids), value_mg_dl=value, context=context, logged_at=T0 + timedelta(days=day, hours=hour - 12))


def eat_and_check(day, hour, desc, after_value, carbs=None):
    """A meal plus a reading 2 h later."""
    return meal(day, hour, desc, carbs), reading(day, hour + 2, after_value)


def run(meals=(), readings=(), prev=(), days=30, tz=0, now=None):
    return build_insights(list(meals), list(readings), list(prev), gt.GlucoseTargets(), days, tz, now=now or T0 + timedelta(days=30))


class FoodKeyTest(unittest.TestCase):
    def test_groups_variants(self):
        self.assertEqual(food_key("Jollof rice & chicken"), "jollof rice")
        self.assertEqual(food_key("jollof rice"), "jollof rice")
        self.assertEqual(food_key("Jollof Rice with plantain"), "jollof rice")
        self.assertEqual(food_key("2 slices toast"), "slices toast")
        self.assertEqual(food_key("Oats, berries"), "oats")


class InsightsTest(unittest.TestCase):
    def test_empty_gives_nudge_and_needs(self):
        data = run()
        self.assertEqual(data["highlight"]["kind"], "nudge")
        self.assertEqual(data["food"]["needed"], 3)
        self.assertEqual(data["patterns"]["needed"], 6)
        self.assertEqual(data["trends"]["insights"], [])

    def test_food_to_watch_and_food_that_works(self):
        meals, readings = [], []
        for d in range(3):
            m, r = eat_and_check(d, 13, "Jollof rice & chicken", 210, carbs=60)
            meals.append(m); readings.append(r)
            m, r = eat_and_check(d, 8, "Oats with berries", 140, carbs=25)
            meals.append(m); readings.append(r)
        data = run(meals, readings)
        food = data["food"]
        self.assertEqual(food["needed"], 0)
        self.assertEqual(food["foods_to_watch"][0]["name"], "Jollof rice")
        self.assertEqual(food["foods_to_watch"][0]["above"], 3)
        self.assertEqual(len(food["foods_to_watch"][0]["meal_ids"]), 3)
        self.assertEqual(food["foods_that_work"][0]["name"], "Oats")
        self.assertIn("Jollof rice was above target 3 of 3 times after eating.", food["insights"])
        self.assertTrue(any(i.startswith("Meals over 45g carbs were above target 3 of 3 times; under 30g, on target 3 of 3") for i in food["insights"]))
        self.assertEqual(data["highlight"]["tab"], "food")

    def test_single_occurrence_is_not_a_finding(self):
        meals, readings = [], []
        for d, desc in enumerate(["Pizza", "Burger", "Pasta"]):
            m, r = eat_and_check(d, 13, desc, 220)
            meals.append(m); readings.append(r)
        food = run(meals, readings)["food"]
        self.assertEqual(food["foods_to_watch"], [])
        self.assertEqual(food["checked_meals"], 3)

    def test_meals_without_after_reading_do_not_count(self):
        meals = [meal(d, 13, "Jollof rice", 60) for d in range(5)]
        food = run(meals, [])["food"]
        self.assertEqual(food["checked_meals"], 0)
        self.assertEqual(food["needed"], 3)

    def test_trends_compare_with_previous_period(self):
        now_r = [reading(d, 9, 100, "fasting") for d in range(4)]
        prev_r = [reading(d - 40, 9, 160, "fasting") for d in range(4)]
        prev_r[0].value_mg_dl = 100
        t = run(readings=now_r, prev=prev_r)["trends"]
        self.assertEqual((t["on_target"], t["readings"], t["prev_on_target"], t["prev_readings"]), (4, 4, 1, 4))
        self.assertIn("up from 1 of 4", t["insights"][0])

    def test_trends_flag_lows(self):
        t = run(readings=[reading(0, 9, 60), reading(1, 9, 100)])["trends"]
        self.assertTrue(any("1 low reading" in i for i in t["insights"]))

    def test_time_of_day_pattern_uses_local_time(self):
        readings = [reading(d, 8, 100, "fasting") for d in range(4)]       # mornings on target
        readings += [reading(d, 20, 200, "after_meal") for d in range(4)]  # evenings above
        p = run(readings=readings)["patterns"]
        self.assertIn("Your evening readings were off target most often (4 of 4).", p["insights"])
        self.assertIn("Morning was your best time: 4 of 4 on target.", p["insights"])
        # Same readings seen from UTC+5: 08:00 UTC is 13:00 local (afternoon).
        p5 = run(readings=readings, tz=300)["patterns"]
        self.assertEqual({s["key"] for s in p5["time_slots"]}, {"afternoon", "night"})

    def test_fasting_trend(self):
        readings = [reading(d, 7, v, "fasting") for d, v in enumerate([150, 145, 120, 115, 110, 105])]
        p = run(readings=readings)["patterns"]
        self.assertIn("Your fasting readings have been coming down.", p["insights"])


class FoodNameGroupingTest(unittest.TestCase):
    def test_standard_food_name_groups_different_wording(self):
        meals, readings = [], []
        for d, text in enumerate(["rice and stew", "Stew with rice", "white rice & beef stew"]):
            m, r = eat_and_check(d, 13, text, 210)
            m.food_name = "Rice and stew"
            meals.append(m); readings.append(r)
        food = run(meals, readings)["food"]
        self.assertEqual(food["foods_to_watch"][0]["name"], "Rice and stew")
        self.assertEqual(food["foods_to_watch"][0]["times"], 3)


class HighlightTest(unittest.TestCase):
    def test_recent_meal_without_reading_comes_first(self):
        meals, readings = [], []
        for d in range(3):
            m, r = eat_and_check(d, 13, "Jollof rice", 210)
            meals.append(m); readings.append(r)
        lunch = meal(5, 12, "Egg sandwich")
        h = run(meals + [lunch], readings, now=lunch.logged_at + timedelta(minutes=40))["highlight"]
        self.assertEqual(h["kind"], "check_meal")
        self.assertEqual(h["action"], "log_glucose_after")
        self.assertEqual(h["meal"]["description"], "Egg sandwich")
        self.assertEqual(h["check_at"], (lunch.logged_at + timedelta(hours=2)).isoformat() + "Z")

    def test_old_meal_without_reading_is_not_chased(self):
        lunch = meal(5, 12, "Egg sandwich")
        h = run([lunch], [], now=lunch.logged_at + timedelta(hours=4))["highlight"]
        self.assertEqual(h["kind"], "nudge")
        self.assertEqual(h["action"], "log_meal")
        self.assertIn("Log a meal, then your glucose", h["text"])

    def test_readings_but_no_meals(self):
        h = run([], [reading(0, 9, 100)])["highlight"]
        self.assertEqual(h["text"], "Log what you eat to see which foods affect your readings.")

    def test_food_insight_beats_trends(self):
        meals, readings = [], []
        for d in range(3):
            m, r = eat_and_check(d, 13, "Jollof rice", 210)
            meals.append(m); readings.append(r)
        h = run(meals, readings)["highlight"]
        self.assertEqual((h["kind"], h["tab"]), ("insight", "food"))


class CarbInsightsTest(unittest.TestCase):
    """Meals logged, no readings: insights come from carbs."""

    def meals_only(self):
        # T0 is 12:00 UTC on day 0; "now" is day 30. Week = days 24-30.
        out = []
        for d in range(24, 30):
            out.append(meal(d, 8, "Oats with berries", 22))      # breakfast
            out.append(meal(d, 19, "Jollof rice & chicken", 65))  # dinner
        return out

    def run_meals_only(self, **kw):
        return build_insights(self.meals_only(), [], [], gt.GlucoseTargets(), 30, 0,
                              now=T0 + timedelta(days=30), **kw)

    def test_average_vs_meal_guide(self):
        data = self.run_meals_only(carb_goal_g=130, goal_mode="ceiling")
        ins = data["food"]["carb_insights"]
        self.assertIn("Your meals averaged 44g carbs this week, right around your 43g per-meal guide.", ins)
        self.assertIn("Breakfast is your lightest meal: about 22g carbs on average.", ins)
        self.assertIn("Jollof rice is your highest-carb regular meal: about 65g.", ins)

    def test_home_highlight_uses_carbs_for_meals_only_users(self):
        h = self.run_meals_only(carb_goal_g=130, goal_mode="ceiling")["highlight"]
        self.assertEqual((h["kind"], h["tab"]), ("insight", "food"))
        self.assertTrue(h["text"].startswith("Your meals averaged"))
        self.assertIn("2 hours after a meal", h["sub"])

    def test_type1_no_goal_comparison(self):
        ins = self.run_meals_only(carb_goal_g=None, goal_mode="none")["food"]["carb_insights"]
        self.assertEqual(ins[0], "Your meals averaged 44g carbs this week.")

    def test_too_few_meals(self):
        data = build_insights([meal(29, 8, "Toast", 30)], [], [], gt.GlucoseTargets(), 30, 0,
                              now=T0 + timedelta(days=30), carb_goal_g=130)
        self.assertEqual(data["food"]["carb_insights"], [])
        self.assertEqual(data["highlight"]["kind"], "nudge")


if __name__ == "__main__":
    unittest.main()

import unittest
from unittest import mock

from app.services import meal_carb_estimate as mce


class CleanTest(unittest.TestCase):
    def test_not_food(self):
        self.assertEqual(mce._clean({"recognized": False}), {"recognized": False})

    def test_clamps_and_tidies(self):
        out = mce._clean({
            "recognized": True,
            "food_name": "  Jollof   rice ",
            "carbs_g": 999.6,
            "items": [{"name": "Jollof rice", "carbs_g": 45.4}, {"bad": 1}],
            "confidence": "weird",
        })
        self.assertEqual(out["carbs_g"], mce.MAX_CARBS_G)
        self.assertEqual(out["food_name"], "Jollof rice")
        self.assertEqual(out["items"], [{"name": "Jollof rice", "carbs_g": 45}])
        self.assertEqual(out["confidence"], "medium")

    def test_unparseable_carbs_is_a_failure(self):
        self.assertIsNone(mce._clean({"recognized": True, "carbs_g": "lots"}))

    def test_no_api_key_means_no_estimate(self):
        with mock.patch.object(mce.settings, "openai_api_key", None), mock.patch.object(mce.cache, "get", return_value=None):
            self.assertEqual(mce.estimate_meal_carbs("rice"), (None, False))

    def test_cached_answer_is_reused(self):
        with mock.patch.object(mce.cache, "get", return_value='{"recognized": true, "carbs_g": 45}'):
            self.assertEqual(mce.estimate_meal_carbs("  Jollof RICE "), ({"recognized": True, "carbs_g": 45}, True))


if __name__ == "__main__":
    unittest.main()

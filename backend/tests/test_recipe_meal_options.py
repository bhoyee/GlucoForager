import unittest

from app.api.endpoints.app_health_log import recipe_carbs_per_serving


class RecipeCarbsTest(unittest.TestCase):
    def test_reads_each_saved_shape(self):
        self.assertEqual(recipe_carbs_per_serving({"nutritional_info": {"carbs": 32.4}}), 32)
        self.assertEqual(recipe_carbs_per_serving({"nutrition": {"carbs": "28g"}}), 28)
        self.assertEqual(recipe_carbs_per_serving({"nutrition_per_serving": {"carbohydrates": "40"}}), 40)

    def test_missing_or_nonsense_is_none(self):
        self.assertIsNone(recipe_carbs_per_serving({}))
        self.assertIsNone(recipe_carbs_per_serving({"nutrition": {"carbs": "lots"}}))
        self.assertIsNone(recipe_carbs_per_serving({"nutrition": {"carbs": 9999}}))
        self.assertIsNone(recipe_carbs_per_serving(None))


if __name__ == "__main__":
    unittest.main()

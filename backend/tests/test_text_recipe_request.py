import unittest

from pydantic import ValidationError

from app.api.endpoints.text_recipes import TextRecipeRequest


class TextRecipeRequestTest(unittest.TestCase):
    def test_deduplicates_normalized_and_comma_separated_ingredients(self):
        request = TextRecipeRequest(
            ingredients=[" Salt ", "salt", "SPICES, spices", "whole   egg", "whole egg."]
        )
        self.assertEqual(request.ingredients, ["Salt", "SPICES", "whole egg"])

    def test_accepts_fifty_unique_ingredients_before_counting_duplicates(self):
        ingredients = [f"ingredient {index}" for index in range(50)]
        request = TextRecipeRequest(ingredients=ingredients + [" INGREDIENT 0 ", "ingredient 49"])
        self.assertEqual(request.ingredients, ingredients)

    def test_rejects_fifty_one_unique_ingredients(self):
        with self.assertRaises(ValidationError) as raised:
            TextRecipeRequest(ingredients=[f"ingredient {index}" for index in range(51)])
        self.assertEqual(raised.exception.errors()[0]["type"], "too_long")


if __name__ == "__main__":
    unittest.main()

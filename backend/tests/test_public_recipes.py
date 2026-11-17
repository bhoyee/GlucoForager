"""Public recipe pages: clean URLs and only good recipes on the website."""

import unittest
from unittest import mock

from app.api.endpoints import public_recipes
from app.services.cache_service import CacheService

from app.api.endpoints.public_recipes import _ingredients, _matches_quick, is_public_quality, recipe_slug, slugify
from app.models.recipe import Recipe


def make_recipe(**overrides) -> Recipe:
    data = dict(
        id=42,
        name="Pan-Seared Chicken with Garlic Broccoli Sauté",
        meal_type="dinner",
        prep_time_minutes=10,
        cook_time_minutes=15,
        nutrition={"calories": 320, "carbs": 8, "protein": 45, "fiber": 4},
        ingredients=[{"name": "chicken", "quantity": 2, "unit": "pieces"}, "broccoli", {"name": ""}],
        instructions=["a", "b", "c"],
        dietary_tags=["halal"],
        safety_flags=[{"code": "low_fiber", "level": "warning"}],
    )
    data.update(overrides)
    return Recipe(**data)


class PublicRecipeCacheTest(unittest.TestCase):
    def test_endpoints_round_trip_json_in_redis_and_memory(self):
        for redis_enabled in (True, False):
            for endpoint in ("list", "sitemap", "detail"):
                with self.subTest(redis=redis_enabled, endpoint=endpoint):
                    cache = CacheService()
                    cache.client = None
                    stored = {}
                    if redis_enabled:
                        client = mock.Mock()

                        def setex(key, ttl, value):
                            self.assertIsInstance(value, str)
                            self.assertEqual(ttl, public_recipes.CACHE_TTL)
                            stored[key] = value.encode("utf-8")

                        client.setex.side_effect = setex
                        client.get.side_effect = lambda key: stored.get(key)
                        cache.client = client

                    query = mock.MagicMock()
                    query.filter.return_value = query
                    query.order_by.return_value = query
                    query.limit.return_value = query
                    query.first.return_value = make_recipe()
                    query.all.return_value = []
                    with mock.patch.object(public_recipes, "cache", cache), mock.patch.object(
                        public_recipes, "_all_public", return_value=[make_recipe()]
                    ) as all_public, mock.patch.object(public_recipes, "_public_query", return_value=query) as public_query:
                        def call():
                            if endpoint == "list":
                                return public_recipes.list_public_recipes(
                                    meal_type=None, quick=None, q=None, page=1, page_size=24, db=mock.Mock()
                                )
                            if endpoint == "sitemap":
                                return public_recipes.public_recipe_sitemap(db=mock.Mock())
                            return public_recipes.get_public_recipe("recipe-42", db=mock.Mock())

                        first = call()
                        all_public.reset_mock()
                        public_query.reset_mock()
                        self.assertIsInstance(first, dict)
                        self.assertEqual(call(), first)
                        all_public.assert_not_called()
                        public_query.assert_not_called()
                        if redis_enabled:
                            self.assertIs(cache.client, client)
                            client.setex.assert_called_once()


class SlugTest(unittest.TestCase):
    def test_slug_is_readable_ascii_and_ends_with_id(self):
        self.assertEqual(recipe_slug(make_recipe()), "pan-seared-chicken-with-garlic-broccoli-saute-42")

    def test_slug_never_empty(self):
        self.assertEqual(slugify("!!!"), "recipe")


class QualityTest(unittest.TestCase):
    def test_minor_warnings_are_fine(self):
        self.assertTrue(is_public_quality(make_recipe()))

    def test_high_carb_sugar_or_danger_flags_stay_off_the_website(self):
        for flag in ({"code": "high_carbs", "level": "warning"}, {"code": "high_sugar", "level": "warning"}, {"code": "x", "level": "danger"}):
            self.assertFalse(is_public_quality(make_recipe(safety_flags=[flag])), flag)

    def test_missing_carbs_is_not_public(self):
        self.assertFalse(is_public_quality(make_recipe(nutrition={"calories": 300})))


class FormattingAndFiltersTest(unittest.TestCase):
    def test_ingredients_accept_strings_and_skip_blank_names(self):
        names = [i["name"] for i in _ingredients(make_recipe())]
        self.assertEqual(names, ["chicken", "broccoli"])

    def test_quick_filters(self):
        r = make_recipe()
        self.assertTrue(_matches_quick(r, {"low_carb", "high_protein"}))
        self.assertFalse(_matches_quick(r, {"under_20"}))  # 25 minutes
        self.assertFalse(_matches_quick(r, {"vegetarian"}))
        self.assertFalse(_matches_quick(make_recipe(nutrition={"carbs": 45, "calories": 400}), {"low_carb"}))


if __name__ == "__main__":
    unittest.main()

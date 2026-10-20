import unittest
from unittest import mock

from app.api.endpoints import recipes as recipes_endpoint
from app.services import recipe_image_attach_service as attach


class DurableRecipeImageTest(unittest.TestCase):
    """Recent recipes must keep real images, wherever they are stored."""

    def test_r2_image_is_kept(self):
        with mock.patch.object(attach.core_settings, "r2_public_base_url", "https://pub-abc.r2.dev"):
            url = "https://pub-abc.r2.dev/recipethumbnails/x-512.jpg"
            self.assertTrue(recipes_endpoint._is_durable_recipe_image_url(url))

    def test_local_upload_is_kept(self):
        self.assertTrue(recipes_endpoint._is_durable_recipe_image_url("/uploads/recipe-images/x.jpg"))

    def test_placeholder_and_empty_are_not(self):
        self.assertFalse(recipes_endpoint._is_durable_recipe_image_url(
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"))
        self.assertFalse(recipes_endpoint._is_durable_recipe_image_url(""))


if __name__ == "__main__":
    unittest.main()

"""Typed ingredients that are only label additives (a drink's ingredient list) are stopped early."""

import unittest

from app.api.endpoints.text_recipes import _only_label_additives


class LabelAdditivesTest(unittest.TestCase):
    def test_drink_label_is_blocked(self):
        self.assertTrue(_only_label_additives(["water", "citric acid", "sodium citrate"]))
        self.assertTrue(_only_label_additives(["Carbonated Water", "Natural Flavourings", "E330", "sucralose"]))

    def test_real_foods_pass(self):
        self.assertFalse(_only_label_additives(["eggs", "spinach", "tomatoes"]))
        self.assertFalse(_only_label_additives(["chicken", "water", "salt"]))  # water alongside food is fine
        self.assertFalse(_only_label_additives(["lemon", "water"]))
        self.assertFalse(_only_label_additives([]))


if __name__ == "__main__":
    unittest.main()

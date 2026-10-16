import unittest
from types import SimpleNamespace

from app.services import glucose_targets as gt

DEFAULTS = gt.GlucoseTargets()


class ClassifyTest(unittest.TestCase):
    def status(self, value, context=None, targets=DEFAULTS):
        return gt.classify(value, context, targets)["status"]

    def test_premeal_range_is_inclusive_80_to_130(self):
        for context in ("fasting", "before_meal"):
            self.assertEqual(self.status(80, context), gt.IN_RANGE)
            self.assertEqual(self.status(130, context), gt.IN_RANGE)
            self.assertEqual(self.status(131, context), gt.ABOVE)
            self.assertEqual(self.status(75, context), gt.BELOW)

    def test_after_meal_is_in_range_below_180(self):
        self.assertEqual(self.status(179, "after_meal"), gt.IN_RANGE)
        self.assertEqual(self.status(180, "after_meal"), gt.ABOVE)
        self.assertEqual(self.status(75, "after_meal"), gt.IN_RANGE)

    def test_untagged_and_bedtime_use_70_to_180(self):
        for context in (None, "bedtime"):
            self.assertEqual(self.status(70, context), gt.IN_RANGE)
            self.assertEqual(self.status(179, context), gt.IN_RANGE)
            self.assertEqual(self.status(180, context), gt.ABOVE)

    def test_safety_bands_override_context(self):
        self.assertEqual(self.status(69, "after_meal"), gt.LOW)
        self.assertEqual(self.status(55, "fasting"), gt.LOW)
        self.assertEqual(self.status(250, None), gt.VERY_HIGH)
        self.assertEqual(self.status(320, "before_meal"), gt.VERY_HIGH)

    def test_delta_is_distance_from_the_nearest_target_edge(self):
        self.assertEqual(gt.classify(166, "before_meal", DEFAULTS)["delta_mg_dl"], 36)
        self.assertEqual(gt.classify(72, "fasting", DEFAULTS)["delta_mg_dl"], 8)
        self.assertEqual(gt.classify(110, "fasting", DEFAULTS)["delta_mg_dl"], 0)

    def test_custom_targets_are_used(self):
        loose = gt.GlucoseTargets(premeal_low=90, premeal_high=150, postmeal_high=200, is_default=False)
        self.assertEqual(self.status(145, "before_meal", loose), gt.IN_RANGE)
        self.assertEqual(self.status(195, "after_meal", loose), gt.IN_RANGE)
        self.assertEqual(self.status(85, "fasting", loose), gt.BELOW)


class TargetsForTest(unittest.TestCase):
    def test_defaults_when_unset(self):
        user = SimpleNamespace(
            glucose_target_premeal_low_mgdl=None, glucose_target_premeal_high_mgdl=None, glucose_target_postmeal_high_mgdl=None
        )
        t = gt.targets_for(user)
        self.assertTrue(t.is_default)
        self.assertEqual((t.premeal_low, t.premeal_high, t.postmeal_high), (80, 130, 180))

    def test_saved_targets(self):
        user = SimpleNamespace(
            glucose_target_premeal_low_mgdl=90, glucose_target_premeal_high_mgdl=140, glucose_target_postmeal_high_mgdl=200
        )
        t = gt.targets_for(user)
        self.assertFalse(t.is_default)
        self.assertEqual((t.premeal_low, t.premeal_high, t.postmeal_high), (90, 140, 200))


class ValidateTest(unittest.TestCase):
    def test_accepts_defaults(self):
        self.assertIsNone(gt.validate_targets(80, 130, 180))

    def test_rejects_out_of_bounds_and_inverted(self):
        self.assertIsNotNone(gt.validate_targets(30, 130, 180))
        self.assertIsNotNone(gt.validate_targets(130, 120, 180))
        self.assertIsNotNone(gt.validate_targets(80, 160, 140))


if __name__ == "__main__":
    unittest.main()

import unittest

from app.services.glucose_impact import estimate_impact, estimate_gi


class ImpactTest(unittest.TestCase):
    def test_bands_follow_glycaemic_load(self):
        self.assertEqual(estimate_impact(carbs_g=10, gi=70)["impact"], "gentle")     # GL 7
        self.assertEqual(estimate_impact(carbs_g=25, gi=60)["impact"], "moderate")   # GL 15
        self.assertEqual(estimate_impact(carbs_g=50, gi=70)["impact"], "sharp")      # GL 35

    def test_fibre_lowers_load_and_delays_peak(self):
        plain = estimate_impact(carbs_g=40, gi=55)
        fibrous = estimate_impact(carbs_g=40, fiber_g=8, gi=55)
        self.assertLess(fibrous["glycemic_load"], plain["glycemic_load"])
        self.assertGreater(fibrous["peak_minutes"], plain["peak_minutes"])
        self.assertIn("Fibre slows the rise", fibrous["factors"])

    def test_sugary_drink_peaks_early_and_sharp(self):
        cola = estimate_impact(carbs_g=35, sugars_g=35, is_drink=True)
        self.assertEqual(cola["impact"], "sharp")
        self.assertLessEqual(cola["peak_minutes"], 30)
        self.assertEqual(cola["gi_source"], "estimated")

    def test_curve_shape(self):
        out = estimate_impact(carbs_g=40, gi=60)
        values = [v for _, v in out["points"]]
        self.assertEqual(out["points"][0], [0, 0.0])
        self.assertEqual(out["points"][-1][0], 120)
        peak_t = out["points"][values.index(max(values))][0]
        self.assertLessEqual(abs(peak_t - out["peak_minutes"]), 5)

    def test_low_carb_food(self):
        out = estimate_impact(carbs_g=3, protein_g=25, fat_g=10)
        self.assertEqual(out["impact"], "gentle")
        self.assertEqual(out["factors"], ["Very few carbs, so little effect on blood sugar"])

    def test_two_hour_summary(self):
        cola = estimate_impact(carbs_g=35, sugars_g=35, is_drink=True)
        self.assertEqual(cola["two_hour"]["level"], "baseline")  # fast in, fast out
        slow = estimate_impact(carbs_g=60, fiber_g=8, protein_g=25, fat_g=20, gi=60)
        self.assertIn(slow["two_hour"]["level"], ("falling", "raised"))
        self.assertEqual(estimate_impact(carbs_g=2)["two_hour"]["text"], "Little change by 2 hours")

    def test_no_carbs_no_estimate(self):
        self.assertIsNone(estimate_impact(carbs_g=None))

    def test_gi_estimate_range(self):
        self.assertGreater(estimate_gi(carbs=30, sugars=28, fibre=0, protein=0, fat=0, drink=True), 65)
        self.assertLess(estimate_gi(carbs=30, sugars=2, fibre=6, protein=20, fat=15, drink=False), 50)


if __name__ == "__main__":
    unittest.main()

import unittest

from app.services import food_label as fl


def lights(per_100g, drink=False, per_serving=None, qty=None):
    return {l["key"]: l["level"] for l in fl.traffic_lights(per_100g, drink, per_serving, qty)}


class TrafficLightTest(unittest.TestCase):
    def test_food_thresholds(self):
        out = lights({"fat_g": 3.0, "saturates_g": 5.1, "sugars_g": 10, "salt_g": 1.5})
        self.assertEqual(out, {"fat": "low", "saturates": "high", "sugars": "medium", "salt": "medium"})

    def test_drink_thresholds_are_stricter(self):
        self.assertEqual(lights({"sugars_g": 10.6}, drink=True)["sugars"], "medium")
        self.assertEqual(lights({"sugars_g": 12}, drink=True)["sugars"], "high")

    def test_big_portion_rule(self):
        # 330ml can, 35g sugar per can: red even though per 100ml is amber.
        self.assertEqual(lights({"sugars_g": 10.6}, True, {"sugars_g": 35}, 330)["sugars"], "high")
        # Small portion: the per-portion rule doesn't apply.
        self.assertEqual(lights({"sugars_g": 10.6}, True, {"sugars_g": 35}, 90)["sugars"], "medium")

    def test_missing_values_skipped(self):
        self.assertEqual(lights({"fat_g": None, "salt_g": 0.1}), {"salt": "low"})


class FibreAndShareTest(unittest.TestCase):
    def test_fibre_claims(self):
        self.assertEqual(fl.fibre_claim({"fiber_g": 6}), "high")
        self.assertEqual(fl.fibre_claim({"fiber_g": 3}), "source")
        self.assertIsNone(fl.fibre_claim({"fiber_g": 2.9}))

    def test_meal_share_only_for_ceiling_goals(self):
        self.assertEqual(fl.meal_share(35, 130, "ceiling")["pct_of_meal"], 81)
        self.assertIsNone(fl.meal_share(35, None, "none"))
        self.assertIsNone(fl.meal_share(35, 175, "floor"))
        self.assertIsNone(fl.meal_share(None, 130, "ceiling"))


class InsightsTest(unittest.TestCase):
    def test_sugary_drink(self):
        per_100g = {"carbs_g": 10.6, "sugars_g": 10.6, "fiber_g": 0}
        out = fl.build_insights(
            per_serving={"carbs_g": 35, "sugars_g": 35}, per_100g=per_100g,
            lights=fl.traffic_lights(per_100g, True, {"sugars_g": 35}, 330), fibre=None, nova_group=4,
            share=fl.meal_share(35, 130, "ceiling"), serving_size="330 ml", drink=True,
        )
        texts = " ".join(i["text"] for i in out)
        self.assertIn("81% of a typical meal", texts)
        self.assertIn("High in sugar", texts)
        self.assertNotIn("Little fibre", texts)  # not said about drinks
        self.assertLessEqual(len(out), 4)


class CountryStandardTest(unittest.TestCase):
    per_100g = {"fat_g": 0, "saturates_g": 0, "sugars_g": 10.6, "salt_g": 0.0}
    per_serving = {"fat_g": 0, "saturates_g": 0, "sugars_g": 35, "salt_g": 0.03}

    def test_us_uses_fda_daily_values(self):
        out = fl.nutrient_ratings(self.per_100g, self.per_serving, True, "us")
        self.assertEqual(out["system"], "us_fda_dv")
        sugars = next(l for l in out["lights"] if l["key"] == "sugars")
        self.assertEqual((sugars["pct_dv"], sugars["level"]), (70, "high"))
        sodium = next(l for l in out["lights"] if l["key"] == "salt")
        self.assertEqual((sodium["value_mg"], sodium["level"]), (12, "low"))

    def test_canada_high_at_15_percent(self):
        out = fl.nutrient_ratings(self.per_100g, {"sugars_g": 16}, True, "CA")
        self.assertEqual(out["system"], "ca_high_in")
        self.assertEqual(out["lights"][0]["level"], "high")

    def test_uk_and_others_use_fsa(self):
        self.assertEqual(fl.nutrient_ratings(self.per_100g, self.per_serving, True, "GB")["system"], "uk_fsa")
        other = fl.nutrient_ratings(self.per_100g, self.per_serving, True, "NG")
        self.assertEqual(other["system"], "uk_fsa")
        self.assertTrue(other["standard"].startswith("Reference"))

    def test_us_without_serving_falls_back(self):
        self.assertEqual(fl.nutrient_ratings(self.per_100g, None, True, "US")["system"], "uk_fsa")


if __name__ == "__main__":
    unittest.main()

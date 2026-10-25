"""Blog autopilot: keyword grouping, scoring, week planning dates and draft clean-up."""

import unittest
from datetime import date
from unittest import mock

from app.services import blog_autopilot
from app.services.blog_keyword_research import Candidate, Phrase, cluster, diverse, is_relevant, overlaps, score, topic_key


class KeywordTest(unittest.TestCase):
    def test_same_food_lands_in_one_topic(self):
        self.assertEqual(topic_key("is oatmeal good for diabetics"), topic_key("oatmeal for type 2 diabetes"))
        self.assertEqual(topic_key("can diabetics eat potatoes"), "potato")

    def test_medication_diagnosis_and_off_niche_searches_are_dropped(self):
        self.assertTrue(is_relevant("can diabetics eat watermelon"))
        for text in ("what to eat when blood sugar is low", "ozempic for diabetes", "signs of diabetes in women", "diabetic dog food", "metformin side effects diabetes"):
            self.assertFalse(is_relevant(text), text)

    def test_cluster_names_topic_after_most_widely_seen_phrase(self):
        phrases = {
            "oatmeal for diabetics": Phrase("oatmeal for diabetics", {("google", "us")}, 3),
            "is oatmeal good for diabetics": Phrase("is oatmeal good for diabetics", {("google", "us"), ("bing", "gb")}, 1),
        }
        [c] = cluster(phrases)
        self.assertEqual(c.keyword, "is oatmeal good for diabetics")
        self.assertEqual(len(c.phrases), 2)

    def test_existing_posts_block_overlapping_topics(self):
        self.assertTrue(overlaps(topic_key("best breakfast for diabetics"), topic_key("diabetic breakfast ideas best")))
        self.assertFalse(overlaps(topic_key("rice"), topic_key("watermelon")))

    def test_shortlist_limits_one_event_or_food_to_two_topics(self):
        cands = [Candidate(topic_key(k), k, [k], set(), 0) for k in (
            "diabetic christmas cookies", "diabetic christmas cake", "diabetic christmas pudding", "rice diabetes")]
        self.assertEqual([c.keyword for c in diverse(cands, 10)], ["diabetic christmas cookies", "diabetic christmas cake", "rice diabetes"])

    def test_volume_trend_and_reach_raise_the_score(self):
        base = Candidate("x", "x", ["x"], {("google", "us")}, 5)
        rich = Candidate("x", "x", ["x", "y"], {("google", "us"), ("bing", "gb")}, 0, bing_volume=5000, trend=1.5)
        self.assertGreater(score(rich), score(base))


class PlanningTest(unittest.TestCase):
    def test_sunday_plans_next_week_other_days_plan_this_week(self):
        self.assertEqual(blog_autopilot.planning_week(date(2026, 10, 25)), date(2026, 10, 26))  # Sunday
        self.assertEqual(blog_autopilot.planning_week(date(2026, 10, 28)), date(2026, 10, 26))  # Wednesday

    def test_reason_text_is_readable(self):
        text = blog_autopilot.reason_text(
            {"countries": ["gb", "us"], "engines": ["bing", "google"], "bing_volume": 1240, "trend": 1.35, "phrases": 4}
        )
        self.assertIn("UK+US", text)
        self.assertIn("1,240", text)
        self.assertIn("rising 35%", text)

    def test_topic_pick_falls_back_to_score_order_without_ai(self):
        cands = [Candidate(str(i), f"kw {i}", ["p"], set(), 0, score=10 - i) for i in range(8)]
        with mock.patch.object(blog_autopilot, "_ask_json", return_value=None):
            picks = blog_autopilot.choose_topics(cands, [], 6)
        self.assertEqual([p["candidate"].keyword for p in picks], [f"kw {i}" for i in range(6)])

    def test_ai_picks_are_validated(self):
        cands = [Candidate(str(i), f"kw {i}", ["p"], set(), 0) for i in range(4)]
        reply = {"picks": [{"index": 2, "title_idea": "T"}, {"index": 2}, {"index": 99}, {"index": "1"}]}
        with mock.patch.object(blog_autopilot, "_ask_json", return_value=reply):
            picks = blog_autopilot.choose_topics(cands, [], 3)
        self.assertEqual([p["candidate"].keyword for p in picks], ["kw 2", "kw 0", "kw 1"])
        self.assertEqual(picks[0]["title_idea"], "T")


class DraftCleanupTest(unittest.TestCase):
    def test_only_known_internal_and_trusted_links_survive(self):
        html = (
            '<p><a href="https://www.glucoforager.com/recipes/egg-muffins-3">egg muffins</a> '
            '<a href="https://www.glucoforager.com/recipes/made-up-9">fake</a> '
            '<a href="https://www.nhs.uk/conditions/type-2-diabetes/">NHS</a> '
            '<a href="https://randomblog.example/post">blog</a></p>'
        )
        out, removed = blog_autopilot.clean_links(
            html, {"https://www.glucoforager.com/recipes/egg-muffins-3"}, check_external=False
        )
        self.assertIn('href="https://www.glucoforager.com/recipes/egg-muffins-3"', out)
        self.assertIn('href="https://www.nhs.uk/conditions/type-2-diabetes/"', out)
        self.assertNotIn("made-up-9", out)
        self.assertNotIn("randomblog", out)
        self.assertEqual(len(removed), 2)

    def test_quality_checks_flag_thin_drafts(self):
        warnings = blog_autopilot.quality_checks({"title": "Rice", "seo_description": "short"}, "<p>tiny</p>", "can diabetics eat rice")
        self.assertTrue(any("Short" in w for w in warnings))
        self.assertTrue(any("Meta description" in w for w in warnings))
        self.assertFalse(any("title" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()

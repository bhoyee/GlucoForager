import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.api.endpoints.app_region import _should_ask
from app.services import geo_country as g


def user(**kw):
    base = dict(country_code=None, detected_countries=None, phone_region=None,
                country_prompt_count=0, country_prompt_snoozed_until=None)
    base.update(kw)
    return SimpleNamespace(**base)


def history(*codes, start="2026-10-01"):
    d0 = datetime.fromisoformat(start)
    return [{"d": (d0 + timedelta(days=i)).date().isoformat(), "c": c} for i, c in enumerate(codes)]


class HistoryTest(unittest.TestCase):
    def test_one_entry_per_day_for_30_days(self):
        h = g.record_observation([], "GB", "2026-10-20")
        h = g.record_observation(h, "ES", "2026-10-20")  # same day: replaced, not added
        self.assertEqual(h, [{"d": "2026-10-20", "c": "ES"}])
        old = history("GB", start="2026-09-01")
        self.assertEqual(g.record_observation(old, "GB", "2026-10-20"), [{"d": "2026-10-20", "c": "GB"}])

    def test_holiday_or_vpn_is_outvoted(self):
        self.assertEqual(g.usual_country(history("GB", "GB", "GB", "ES", "ES", "GB")), "GB")

    def test_tie_goes_to_most_recent(self):
        self.assertEqual(g.usual_country(history("GB", "US")), "US")

    def test_effective_country_order(self):
        self.assertEqual(g.effective_country(user(country_code="ng", detected_countries=history("GB"))), ("NG", "chosen"))
        self.assertEqual(g.effective_country(user(detected_countries=history("GB"), phone_region="US")), ("GB", "ip"))
        self.assertEqual(g.effective_country(user(phone_region="US")), ("US", "phone"))
        self.assertEqual(g.effective_country(user()), (None, "none"))


class AskTest(unittest.TestCase):
    now = datetime(2026, 10, 20)

    def test_no_question_when_ip_and_phone_agree(self):
        self.assertEqual(_should_ask(user(detected_countries=history("GB"), phone_region="GB"), self.now), (False, "GB"))

    def test_ask_when_they_disagree_suggesting_ip(self):
        self.assertEqual(_should_ask(user(detected_countries=history("NG"), phone_region="US"), self.now), (True, "NG"))

    def test_ask_when_nothing_known(self):
        self.assertEqual(_should_ask(user(), self.now), (True, None))

    def test_never_ask_once_chosen(self):
        self.assertEqual(_should_ask(user(country_code="GB"), self.now)[0], False)

    def test_snooze_and_max_two(self):
        snoozed = user(country_prompt_count=1, country_prompt_snoozed_until=self.now + timedelta(days=3))
        self.assertFalse(_should_ask(snoozed, self.now)[0])
        expired = user(country_prompt_count=1, country_prompt_snoozed_until=self.now - timedelta(days=1))
        self.assertTrue(_should_ask(expired, self.now)[0])
        self.assertFalse(_should_ask(user(country_prompt_count=2), self.now)[0])


class ClientIpTest(unittest.TestCase):
    def req(self, headers, host="172.18.0.1"):
        return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))

    def test_takes_first_public_forwarded_ip(self):
        self.assertEqual(g.client_ip(self.req({"x-forwarded-for": "10.0.0.2, 81.2.69.142"})), "81.2.69.142")

    def test_private_only_gives_none(self):
        self.assertIsNone(g.client_ip(self.req({})))


if __name__ == "__main__":
    unittest.main()

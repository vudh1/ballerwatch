import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from calendar_gate import compare, pair_hash, same_calendar_match

TZ = ZoneInfo("America/Los_Angeles")


def match(key, date="2026-10-05", fingerprint="fp-new"):
    return {
        "key": key,
        "team": "Team Alpha",
        "opponent": "Opponent",
        "homeAway": "away",
        "date": date,
        "start": f"{date}T19:15:00-07:00",
        "end": f"{date}T20:15:00-07:00",
        "calendarFingerprint": fingerprint,
    }


class CalendarGateTests(unittest.TestCase):
    def test_unchanged_match_is_not_pending(self):
        m = match("same", fingerprint="fp")
        feed = {"teams": [{"matches": [m]}]}
        state = {
            "appliedMatches": {
                "same": {"fingerprint": "fp", "match": m},
            }
        }
        _, pending, _ = compare(
            feed,
            state,
            datetime(2026, 10, 1, 12, tzinfo=TZ),
        )
        self.assertEqual(pending, [])

    def test_old_score_inclusive_fingerprint_migrates_silently(self):
        current = match("same", fingerprint="new-schedule-only")
        previous = dict(current)
        previous["calendarFingerprint"] = "old-score-inclusive"
        previous["teamScore"] = 1
        previous["opponentScore"] = 0
        current["teamScore"] = 2
        current["opponentScore"] = 1

        self.assertTrue(same_calendar_match(previous, current))
        feed = {"teams": [{"matches": [current]}]}
        state = {
            "appliedMatches": {
                "same": {
                    "fingerprint": "old-score-inclusive",
                    "match": previous,
                },
            }
        }
        _, pending, _ = compare(
            feed,
            state,
            datetime(2026, 10, 1, 12, tzinfo=TZ),
        )
        self.assertEqual(pending, [])

    def test_real_schedule_change_still_notifies_after_fingerprint_migration(self):
        current = match("same", fingerprint="new-schedule-only")
        previous = dict(current)
        previous["calendarFingerprint"] = "old-score-inclusive"
        previous["start"] = "2026-10-05T18:15:00-07:00"

        self.assertFalse(same_calendar_match(previous, current))
        feed = {"teams": [{"matches": [current]}]}
        state = {
            "appliedMatches": {
                "same": {
                    "fingerprint": "old-score-inclusive",
                    "match": previous,
                },
            }
        }
        _, pending, _ = compare(
            feed,
            state,
            datetime(2026, 10, 1, 12, tzinfo=TZ),
        )
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["type"], "changed")

    def test_bootstrap_pair_hash_marks_unique_key_change_as_reschedule(self):
        m = match("new-key", date="2026-10-06")
        feed = {"teams": [{"matches": [m]}]}
        state = {
            "appliedMatches": {
                "old-key": {
                    "fingerprint": "fp-old",
                    "match": None,
                    "pairHash": pair_hash(m),
                }
            }
        }
        _, pending, _ = compare(
            feed,
            state,
            datetime(2026, 10, 1, 12, tzinfo=TZ),
        )
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["type"], "rescheduled")
        self.assertEqual(pending[0]["oldKey"], "old-key")

    def test_ambiguous_pair_hash_does_not_guess(self):
        m = match("new-key", date="2026-10-06")
        ph = pair_hash(m)
        feed = {"teams": [{"matches": [m]}]}
        state = {
            "appliedMatches": {
                "old-a": {"fingerprint": "a", "match": None, "pairHash": ph},
                "old-b": {"fingerprint": "b", "match": None, "pairHash": ph},
            }
        }
        _, pending, _ = compare(
            feed,
            state,
            datetime(2026, 10, 1, 12, tzinfo=TZ),
        )
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["type"], "new")
        self.assertNotIn("oldKey", pending[0])


if __name__ == "__main__":
    unittest.main()

import io
import json
import os
import unittest
from unittest.mock import patch

import google_calendar_pair


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.payload


class CalendarPairTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "GOOGLE_CALENDAR_WEBHOOK_URL": "https://example.invalid/calendar",
            "GOOGLE_CALENDAR_WEBHOOK_SECRET": "secret",
            "BALLERWATCH_CALENDAR_PAIR_MARKER": "bw-pair-test123",
        },
        clear=False,
    )
    @patch("google_calendar_pair.urllib.request.urlopen")
    def test_pairing_reports_only_non_identifying_status(self, urlopen):
        urlopen.return_value = FakeResponse({
            "ok": True,
            "action": "pair-calendar",
            "paired": True,
            "markerDeleted": True,
            "previousDeleted": 1,
            "previousStale": 2,
        })
        with patch("sys.stdout", new_callable=io.StringIO) as stdout:
            result = google_calendar_pair.pair_calendar()

        request = urlopen.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(body["action"], "pair-calendar")
        self.assertEqual(body["marker"], "bw-pair-test123")
        self.assertEqual(body["secret"], "secret")
        self.assertTrue(result["paired"])
        output = stdout.getvalue()
        self.assertIn("calendarPaired=true", output)
        self.assertNotIn("calendarId", output)

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CALENDAR_WEBHOOK_URL": "https://example.invalid/calendar",
            "GOOGLE_CALENDAR_WEBHOOK_SECRET": "secret",
            "BALLERWATCH_CALENDAR_PAIR_MARKER": "bw-pair-test123",
        },
        clear=False,
    )
    @patch("google_calendar_pair.urllib.request.urlopen")
    def test_pairing_surfaces_safe_bridge_error(self, urlopen):
        urlopen.return_value = FakeResponse({
            "ok": False,
            "action": "pair-calendar",
            "error": "target calendar marker is not visible to the Apps Script account",
        })
        with self.assertRaisesRegex(RuntimeError, "marker is not visible"):
            google_calendar_pair.pair_calendar()


if __name__ == "__main__":
    unittest.main()

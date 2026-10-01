import io
import json
import os
import unittest
from unittest.mock import patch

import google_calendar_purge


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.payload


class CalendarPurgeTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "GOOGLE_CALENDAR_WEBHOOK_URL": "https://example.invalid/calendar",
            "GOOGLE_CALENDAR_WEBHOOK_SECRET": "secret",
        },
        clear=False,
    )
    @patch("google_calendar_purge.urllib.request.urlopen")
    def test_purge_sends_authenticated_action_and_returns_counts(self, urlopen):
        urlopen.return_value = FakeResponse({
            "ok": True,
            "action": "purge",
            "deleted": 3,
            "clearedProperties": 4,
        })
        with patch("sys.stdout", new_callable=io.StringIO) as stdout:
            result = google_calendar_purge.purge_calendar_events()

        request = urlopen.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(body["action"], "purge")
        self.assertEqual(body["secret"], "secret")
        self.assertEqual(result["deleted"], 3)
        self.assertIn("calendarDeleted=3", stdout.getvalue())

    @patch.dict(
        os.environ,
        {
            "GOOGLE_CALENDAR_WEBHOOK_URL": "https://example.invalid/calendar",
            "GOOGLE_CALENDAR_WEBHOOK_SECRET": "secret",
        },
        clear=False,
    )
    @patch("google_calendar_purge.urllib.request.urlopen")
    def test_purge_surfaces_bridge_error(self, urlopen):
        urlopen.return_value = FakeResponse({
            "ok": False,
            "action": "purge",
            "error": "legacy marker scan failed",
        })
        with self.assertRaisesRegex(RuntimeError, "legacy marker scan failed"):
            google_calendar_purge.purge_calendar_events()

    @patch.dict(os.environ, {}, clear=True)
    def test_purge_requires_bridge_configuration(self):
        with self.assertRaises(RuntimeError):
            google_calendar_purge.purge_calendar_events()


if __name__ == "__main__":
    unittest.main()

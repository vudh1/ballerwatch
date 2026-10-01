"""Delete BallerWatch-managed RATS events through the authenticated Calendar bridge.

The bridge owns the Calendar event IDs in private Apps Script properties. This client
never logs the webhook secret or Calendar event IDs; it prints only aggregate counts.
"""
import json
import os
import urllib.request


def purge_calendar_events():
    url = (os.environ.get("GOOGLE_CALENDAR_WEBHOOK_URL") or "").strip()
    secret = (os.environ.get("GOOGLE_CALENDAR_WEBHOOK_SECRET") or "").strip()
    if not url or not secret:
        raise RuntimeError(
            "GOOGLE_CALENDAR_WEBHOOK_URL or GOOGLE_CALENDAR_WEBHOOK_SECRET is missing"
        )

    payload = json.dumps({
        "schemaVersion": 1,
        "action": "purge",
        "secret": secret,
    }).encode()
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "ballerwatch-calendar-purge/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()
        result = json.loads(raw) if raw else {}

    if not result.get("ok") or result.get("action") != "purge":
        detail = str(result.get("error") or "unknown bridge error").strip()
        raise RuntimeError(f"Apps Script Calendar purge failed: {detail}")

    deleted = int(result.get("deleted") or 0)
    cleared = int(result.get("clearedProperties") or 0)
    print(f"calendarDeleted={deleted}")
    print(f"calendarTrackingPropertiesCleared={cleared}")
    return result


if __name__ == "__main__":
    purge_calendar_events()

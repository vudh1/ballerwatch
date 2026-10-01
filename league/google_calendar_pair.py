"""Pair the Apps Script Calendar bridge to the intended private Google Calendar.

The pairing marker is temporary and non-sensitive. The bridge stores the matched
calendar ID privately in Script Properties and never returns or logs it.
"""
import json
import os
import urllib.request


def pair_calendar():
    url = (os.environ.get("GOOGLE_CALENDAR_WEBHOOK_URL") or "").strip()
    secret = (os.environ.get("GOOGLE_CALENDAR_WEBHOOK_SECRET") or "").strip()
    marker = (os.environ.get("BALLERWATCH_CALENDAR_PAIR_MARKER") or "").strip()
    if not url or not secret or not marker:
        raise RuntimeError(
            "Calendar bridge URL, secret, and pairing marker are required"
        )

    payload = json.dumps({
        "action": "pair-calendar",
        "marker": marker,
        "secret": secret,
    }).encode()
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "ballerwatch-calendar-pair/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()
        result = json.loads(raw) if raw else {}

    if not result.get("ok") or result.get("action") != "pair-calendar":
        detail = str(result.get("error") or "unknown bridge error").strip()
        raise RuntimeError(f"Apps Script Calendar pairing failed: {detail}")

    if result.get("paired") is not True:
        raise RuntimeError("Apps Script Calendar pairing did not confirm a target")

    print("calendarPaired=true")
    print(f"pairingMarkerDeleted={str(bool(result.get('markerDeleted'))).lower()}")
    print(f"previousManagedEventsDeleted={int(result.get('previousDeleted') or 0)}")
    print(f"previousStaleMappingsCleared={int(result.get('previousStale') or 0)}")
    return result


if __name__ == "__main__":
    pair_calendar()

"""Send changed RATS matches to the Google Apps Script Calendar bridge.

Invoked only after calendar_gate.py reports a material future-match change.
The bridge performs the Calendar mutation and returns per-match success. This
script advances the public-safe applied snapshot only after that response.
"""
import json
import os
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
SCHEDULE = Path("schedule.json")
STATE = Path("calendar-snapshot.json")
CHANGES = Path("calendar-changes.json")
TELEGRAM_UPDATE = Path("telegram-update.json")


def bridge_version(url):
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": "ballerwatch/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
        result = json.loads(raw) if raw else {}
    return int(result.get("version") or 1)


def post_bridge(payload):
    url = os.environ.get("GOOGLE_CALENDAR_WEBHOOK_URL")
    secret = os.environ.get("GOOGLE_CALENDAR_WEBHOOK_SECRET")
    if not url or not secret:
        raise RuntimeError(
            "Calendar change detected but GOOGLE_CALENDAR_WEBHOOK_URL or "
            "GOOGLE_CALENDAR_WEBHOOK_SECRET is missing"
        )
    if any(item.get("oldKey") for item in payload.get("updates", [])):
        if bridge_version(url) < 2:
            raise RuntimeError(
                "Calendar reschedule detected but deployed Apps Script bridge is v1; "
                "redeploy league/google_apps_script/Code.gs before applying it"
            )

    body = json.dumps({**payload, "secret": secret}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "rats-league-watcher/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read()
        result = json.loads(raw) if raw else {}
    if not result.get("ok"):
        raise RuntimeError("Apps Script Calendar bridge rejected or failed the update")
    return result


def main():
    feed = json.loads(SCHEDULE.read_text())
    state = json.loads(STATE.read_text()) if STATE.exists() else {
        "version": 1,
        "appliedMatches": {},
    }
    changes = json.loads(CHANGES.read_text())
    pending = changes.get("pending", [])
    if not pending:
        print("No Calendar changes.")
        return

    # Include the previous applied match for safe reschedule handling.
    requests = []
    for item in pending:
        old_key = item.get("oldKey") or item["key"]
        old = state.get("appliedMatches", {}).get(old_key)
        requests.append({
            "type": item["type"],
            "key": item["key"],
            "oldKey": old_key if old_key != item["key"] else None,
            "match": item["match"],
            "previous": old.get("match") if old else None,
        })

    result = post_bridge({
        "schemaVersion": 1,
        "seasonId": feed.get("seasonId"),
        "sourceContentHash": feed.get("contentHash"),
        "updates": requests,
    })

    by_key = {item.get("key"): item for item in result.get("results", [])}
    completed = []
    for item in pending:
        response = by_key.get(item["key"])
        if not response or not response.get("ok"):
            raise RuntimeError(f'Calendar bridge did not successfully apply {item["key"]}')
        match = item["match"]
        old_key = item.get("oldKey")
        if old_key and old_key != item["key"]:
            state.setdefault("appliedMatches", {}).pop(old_key, None)
        state.setdefault("appliedMatches", {})[item["key"]] = {
            "fingerprint": match["calendarFingerprint"],
            "match": match,
        }
        completed.append({
            "action": response.get("action", "updated"),
            "match": match,
        })
        print(
            f'{response.get("action", "updated")}: '
            f'{match["team"]} vs {match["opponent"]} on {match["date"]}'
        )

    state["version"] = 1
    state["lastAppliedContentHash"] = feed.get("contentHash")
    state["lastAppliedAt"] = datetime.now(TZ).isoformat()
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    TELEGRAM_UPDATE.write_text(
        json.dumps({"updates": completed}, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    main()

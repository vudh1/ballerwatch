"""Decide whether Google Calendar needs to be touched.

Applied Calendar state is encrypted at rest. This module runs only after the
league workflow decrypts it into league/calendar-snapshot.json.
"""
import hashlib
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
SCHEDULE = Path("schedule.json")
STATE = Path("calendar-snapshot.json")
BOOTSTRAP = Path("calendar-bootstrap.json")
CHANGES = Path("calendar-changes.json")

CALENDAR_MATCH_FIELDS = (
    "team",
    "opponent",
    "homeAway",
    "date",
    "startTime",
    "endTime",
    "start",
    "end",
    "endEstimated",
    "timezone",
    "location",
    "fieldNotes",
    "jerseyColor",
    "opponentJerseyColor",
    "division",
    "season",
    "sourceUrl",
    "mapUrl",
    "eventType",
)


def same_calendar_match(previous, current):
    if not isinstance(previous, dict) or not isinstance(current, dict):
        return False
    return {
        field: previous.get(field)
        for field in CALENDAR_MATCH_FIELDS
    } == {
        field: current.get(field)
        for field in CALENDAR_MATCH_FIELDS
    }


def normalize_text(value):
    return " ".join(str(value or "").strip().split()).casefold()


def pair_hash(match):
    raw = "|".join([
        normalize_text(match.get("team")),
        normalize_text(match.get("opponent")),
        normalize_text(match.get("homeAway")),
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


def future_matches(feed, now=None):
    now = now or datetime.now(TZ)
    today = now.date().isoformat()
    result = {}
    for team in feed.get("teams", []):
        for match in team.get("matches", []):
            end = match.get("end")
            if end:
                try:
                    if datetime.fromisoformat(end) <= now:
                        continue
                except ValueError:
                    pass
            elif match.get("date", "") < today:
                continue
            result[match["key"]] = {
                "fingerprint": match["calendarFingerprint"],
                "match": match,
            }
    return result


def hydrate_state_from_bootstrap(current):
    if STATE.exists():
        return json.loads(STATE.read_text())

    state = {"version": 1, "appliedMatches": {}}
    if not BOOTSTRAP.exists():
        return state

    bootstrap = json.loads(BOOTSTRAP.read_text())
    for entry in bootstrap.get("entries", []):
        key = entry.get("key")
        if not key:
            continue
        current_item = current.get(key)
        if current_item and current_item.get("fingerprint") == entry.get("fingerprint"):
            # Exact unchanged match: safe to hydrate with current full data inside
            # the runner. It will be encrypted again before commit.
            state["appliedMatches"][key] = current_item
        else:
            state["appliedMatches"][key] = {
                "fingerprint": entry.get("fingerprint"),
                "match": None,
                "pairHash": entry.get("pairHash"),
            }

    state["lastAppliedContentHash"] = bootstrap.get("lastAppliedContentHash")
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    return state


def compare(feed, state, now=None):
    current = future_matches(feed, now)
    applied = state.get("appliedMatches", {})
    pending = []

    unmatched_old = {
        key: item
        for key, item in applied.items()
        if key not in current
    }

    for key, item in current.items():
        old = applied.get(key)
        if old is None:
            ph = pair_hash(item["match"])
            candidates = [
                old_key
                for old_key, old_item in unmatched_old.items()
                if old_item.get("pairHash") == ph
            ]
            if len(candidates) == 1:
                pending.append({
                    "type": "rescheduled",
                    "oldKey": candidates[0],
                    "key": key,
                    **item,
                })
            else:
                pending.append({"type": "new", "key": key, **item})
        elif old.get("fingerprint") != item["fingerprint"]:
            # v2.6.0 removed scores/internal metadata from the Calendar fingerprint.
            # Compare the actual schedule fields before announcing a change so
            # existing snapshots migrate silently and score-only changes stay quiet.
            if same_calendar_match(old.get("match"), item["match"]):
                continue
            pending.append({
                "type": "changed",
                "key": key,
                "previousFingerprint": old.get("fingerprint"),
                **item,
            })

    missing = []
    reference_now = now or datetime.now(TZ)
    for key, value in applied.items():
        if key in current:
            continue
        old_match = value.get("match")
        if not old_match or not old_match.get("end"):
            continue
        try:
            if datetime.fromisoformat(old_match["end"]) > reference_now:
                missing.append({"key": key, **value})
        except ValueError:
            pass

    return current, pending, missing


def main():
    feed = json.loads(SCHEDULE.read_text())
    current = future_matches(feed)
    state = hydrate_state_from_bootstrap(current)
    _, pending, missing = compare(feed, state)

    result = {
        "schemaVersion": 1,
        "sourceContentHash": feed.get("contentHash"),
        "needsCalendar": bool(pending),
        "pending": pending,
        "missingAppliedFutureMatches": missing,
    }
    CHANGES.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"needsCalendar={'true' if pending else 'false'}")
    print(f"pendingCount={len(pending)}")
    if missing:
        print(f"warning: {len(missing)} applied future match(es) disappeared; no deletion authorized")


if __name__ == "__main__":
    main()

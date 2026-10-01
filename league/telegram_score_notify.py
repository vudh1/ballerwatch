"""Notify Telegram when RATS publishes or corrects a match score."""
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
CHANGES = Path("score-changes.json")


def fmt(value):
    if not value:
        return ""
    return datetime.fromisoformat(value).astimezone(TZ).strftime("%a %m/%d %-I:%M %p")


def send(text):
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing")
    body = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    if not result.get("ok"):
        raise RuntimeError("Telegram score notification failed")


def main():
    if not CHANGES.exists():
        print("No score changes.")
        return
    updates = json.loads(CHANGES.read_text()).get("updates", [])
    if not updates:
        print("No score changes.")
        return

    lines = ["RATS score updated"]
    for item in updates:
        match = item["match"]
        new_score = f'{match.get("teamScore")}-{match.get("opponentScore")}'
        old_team = item.get("previousTeamScore")
        old_opp = item.get("previousOpponentScore")
        previous = ""
        if old_team is not None and old_opp is not None:
            previous = f" ({old_team}-{old_opp} → {new_score})"
        lines.append(
            f'{match["team"]} {new_score} {match["opponent"]}{previous}'
            f' — {fmt(match.get("start"))}'
        )
    send("\n".join(lines))
    print(f"Telegram notified for {len(updates)} score update(s).")


if __name__ == "__main__":
    main()

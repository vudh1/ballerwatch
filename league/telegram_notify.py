"""Send a Telegram notification after successful RATS Calendar updates."""
import html
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Los_Angeles")
UPDATE = Path("telegram-update.json")


def format_time(value):
    if not value:
        return "time not published"
    dt = datetime.fromisoformat(value).astimezone(TZ)
    return dt.strftime("%a %m/%d %-I:%M %p")


def jersey_icon(color):
    value = (color or "").strip().casefold()
    if "white" in value:
        return "⚪"
    if "black" in value:
        return "⚫"
    if "red" in value:
        return "🔴"
    if "blue" in value:
        return "🔵"
    if "yellow" in value:
        return "🟡"
    if "green" in value:
        return "🟢"
    if "orange" in value:
        return "🟠"
    if "purple" in value or "violet" in value:
        return "🟣"
    if "brown" in value:
        return "🟤"
    return "⚽"


def main():
    if not UPDATE.exists():
        print("No successful Calendar changes to notify.")
        return

    data = json.loads(UPDATE.read_text())
    updates = data.get("updates", [])
    if not updates:
        print("No successful Calendar changes to notify.")
        return

    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing")

    lines = ["RATS schedule updated"]
    for item in updates:
        match = item["match"]
        verb = "Added" if item["action"] == "created" else "Updated"
        when = format_time(match.get("start"))
        location = match.get("location") or "location not published"
        jersey = match.get("jerseyColor") or "not published"
        opponent_jersey = match.get("opponentJerseyColor") or "not published"

        team_name = html.escape(str(match["team"]))
        opponent_name = html.escape(str(match["opponent"]))
        location_text = html.escape(str(location))
        map_url = match.get("mapUrl") or (
            "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(str(location))
        )
        icon = jersey_icon(jersey)

        lines.append(
            f'{verb}: {icon} <b>{team_name}</b> vs {opponent_name} — {when} — {location_text} '
            f'— jerseys {html.escape(str(jersey))}/{html.escape(str(opponent_jersey))}'
        )
        if location != "location not published":
            lines.append(f'🗺️ {html.escape(str(map_url), quote=True)}')

    body = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": "\n".join(lines),
        "disable_web_page_preview": "true",
        "parse_mode": "HTML",
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
        raise RuntimeError("Telegram send failed")

    print(f"Telegram notified for {len(updates)} schedule update(s).")


if __name__ == "__main__":
    main()

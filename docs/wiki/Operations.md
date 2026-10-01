# Operations

## Health

The Worker health endpoint reports runtime availability and pickup/league heartbeat ages. The deep watchdog also checks validation health, privacy rules, and cron-job.org configuration.

Watchdog problems and recovery are operational signals only. They are written to encrypted runtime state and GitHub logs; they do **not** send Telegram alerts.

## Telegram notification policy

Allowed proactive Telegram messages are limited to:

- pickup RSVP/capacity alerts from the production pickup watcher;
- real RATS schedule changes;
- one combined version-change announcement per Pacific day.

The bot may also reply directly to owner questions and commands.

Tests, builds, deploys, commits, pull requests, watchdog failures/recovery, setup reminders, invalid-setting reminders, and score-only changes stay silent on Telegram.

## Purge

**Purge current data** removes generated/runtime state, including league-team runtime configuration, so defaults are rebuilt from source configuration. It does not delete source code, GitHub secrets, or Google Calendar events.

## External schedules

cron-job.org jobs are expected to exist and stay enabled:
- pickup: every 2 minutes;
- league: every 5 minutes;
- watchdog: every 10 minutes.

Pickup and league fallback runs are health-gated to avoid duplicate source work while Cloudflare is healthy.

## GitHub Wiki publishing

The canonical pages live in `docs/wiki/`. GitHub's normal Actions token cannot initialize the separate `.wiki.git` repository. To mirror these pages into the GitHub Wiki UI, add a repository secret named `WIKI_TOKEN` with repository write access and run **Publish wiki** once. Future main changes to `docs/wiki/` sync automatically.

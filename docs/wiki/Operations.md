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

**Purge current data** performs a full BallerWatch reset:

1. the authenticated Calendar bridge deletes only BallerWatch-managed RATS events;
2. `runtime-state` generated files are cleared;
3. the normal pickup/league/watchdog schedules rebuild fresh state;
4. the next league reconciliation recreates current future Calendar matches.

The Calendar purge uses private bridge mappings first and the explicit `RATS tracking key:` event-description marker as a legacy safety net. Source code, GitHub/Worker secrets, and unrelated Calendar events are never deleted.

## Active GitHub workflows

Twelve workflows remain after the 2.7.0 audit:

- production: pickup, league, listener, watchdog;
- deployment/configuration: Telegram Worker, Calendar bridge, cron-job.org;
- quality: Validate code, Manual smoke test;
- operations: Purge current data, Publish wiki, Cleanup merged release branches.

The old one-time repository-configuration workflow and redundant failover-cache seeding workflow were removed.

## External schedules

cron-job.org jobs are expected to exist and stay enabled:
- pickup: every 2 minutes;
- league: every 5 minutes;
- watchdog: every 10 minutes.

Pickup and league fallback runs are health-gated to avoid duplicate source work while Cloudflare is healthy.

## GitHub Wiki publishing

The canonical pages live in `docs/wiki/`. GitHub's normal Actions token cannot initialize the separate `.wiki.git` repository. To mirror these pages into the GitHub Wiki UI, add a repository secret named `WIKI_TOKEN` with repository write access and run **Publish wiki** once. Future main changes to `docs/wiki/` sync automatically.

## Calendar target pairing

The Apps Script bridge does not assume its script owner's default Calendar is the desired BallerWatch Calendar.

Pairing uses a temporary non-sensitive marker event on the intended Calendar. The bridge searches calendars visible to the Apps Script account for exactly one marker, stores only that Calendar ID in private Script Properties, removes the marker, and then uses the paired Calendar for sync and purge operations.

No Calendar ID/email is committed or logged. Normal Calendar mutation fails closed if no target is paired.

# Operations

## Health

The Worker health endpoint reports runtime availability and pickup/league heartbeat ages. The deep watchdog also checks validation health, privacy rules, and cron-job.org configuration.

Watchdog problems and recovery are operational signals only. They are written to encrypted runtime state and GitHub logs; they do **not** send Telegram alerts.

## Notification policy

Allowed proactive Telegram and Web Push messages are limited to:

- pickup RSVP/capacity alerts from the production pickup watcher;
- real RATS schedule changes;
- one combined version-change announcement per Pacific day.

The bot may also reply directly to owner questions and commands.

Tests, builds, deploys, commits, pull requests, watchdog failures/recovery, setup reminders, invalid-setting reminders, and score-only changes stay silent on both Telegram and Web Push.

## Purge

**Purge current data** performs a full BallerWatch reset:

1. the authenticated Calendar bridge deletes only BallerWatch-managed RATS events;
2. `runtime-state` generated files are cleared, including Web Push subscriptions and notification-board state;
3. the normal pickup/league/watchdog schedules rebuild fresh state;
4. the next league reconciliation recreates current future Calendar matches.

The Calendar purge uses private bridge mappings first and the explicit `RATS tracking key:` event-description marker as a legacy safety net. Source code, GitHub/Worker secrets, and unrelated Calendar events are never deleted.

## Active GitHub workflows

Fourteen workflows are active in v3.0.0:

- production: pickup, league, listener, watchdog;
- deployment/configuration: Telegram/PWA Worker, Calendar bridge, cron-job.org, GitHub Pages;
- quality: Validate code, Manual smoke test;
- operations: Web app runtime, Purge current data, Publish wiki, Cleanup merged release branches.

The old one-time repository-configuration workflow and redundant failover-cache seeding workflow were removed.

## Runtime implementation

Production automation and tests run on Node.js 22 with ECMAScript modules. The league watcher, Calendar gate/bridge clients, purge/pair helpers, and Telegram schedule notifier share the same Node runtime; GitHub Actions no longer installs Python.

## RATS source resilience

The league watcher retries transient RATS failures such as HTTP 429/502/503/504 and network timeouts with bounded exponential backoff. If all retries fail but an already-validated schedule exists, production keeps that last-good schedule and skips Calendar/Telegram changes for that refresh. Cold starts, authentication failures, malformed schemas, and integrity mismatches still fail closed.

## League game duration

When the RATS export publishes an end time, BallerWatch uses that value. If RATS omits the end time, BallerWatch estimates a **two-hour duration** from the published start time. That estimated end is used consistently for Calendar events and future/past game-window decisions.

## External schedules

cron-job.org has only two required enabled jobs:
- pickup: every 2 minutes;
- league: every 5 minutes.

The legacy Telegram listener job and the retired external watchdog job must remain disabled. The watchdog/maintenance workflow runs natively in GitHub Actions every 6 hours. Pickup and league fallback runs are health-gated to avoid duplicate source work while Cloudflare is healthy.

## Match weather

Every six hours, the maintenance workflow builds a 14-day weather snapshot for published pickup games with a field/address and monitored RATS matches. Forecasts use Open-Meteo hourly data and report the maximum rain probability overlapping the actual game window, plus temperature and condition.

Venue geocoding uses OpenStreetMap Nominatim only for uncached public venue names/addresses. Results are cached in encrypted runtime state; new requests are spaced at more than one second apart and failed lookups are not retried for seven days. The web UI includes Open-Meteo and OpenStreetMap attribution.

If forecast retrieval fails, the last successful match weather may be retained and marked cached/stale instead of removing the game from the calendar.

## GitHub Wiki publishing

The canonical pages live in `docs/wiki/`. The **Publish wiki** workflow mirrors those Markdown pages into the repository's GitHub Wiki using the workflow-scoped `GITHUB_TOKEN` with `contents: write`. No separate Wiki token is required. Changes under `docs/wiki/` on `main` trigger a sync automatically.

## Calendar target pairing

The Apps Script bridge does not assume its script owner's default Calendar is the desired BallerWatch Calendar.

Pairing uses a temporary non-sensitive marker event on the intended Calendar. The bridge searches calendars visible to the Apps Script account for exactly one marker, stores only that Calendar ID in private Script Properties, removes the marker, and then uses the paired Calendar for sync and purge operations.

No Calendar ID/email is committed or logged. Normal Calendar mutation fails closed if no target is paired.


## PWA operations

The static app is deployed from `docs/` by **Deploy GitHub Pages app**. The encrypted VAPID/subscription state is initialized and updated by **Web app runtime**.

Pages uses a one-time repository-admin activation: **Settings → Pages → Build and deployment → Source → GitHub Actions**. After activation, **Deploy GitHub Pages app** uses the workflow-scoped `GITHUB_TOKEN`; it does not require the general automation PAT to have repository Administration permission. Before activation, the workflow reports the required step and exits without a failed deployment.

A subscribed device does not depend on Telegram for delivery. GitHub Actions sends Web Push signals directly to browser push endpoints. The service worker normally fetches the newest public-safe board entry from the Worker; if that read path is unavailable, it displays a generic BallerWatch update instead.

# Operations

## Health

The Worker health endpoint is a **readiness** check, not just a process-liveness check. It returns healthy only when the Worker can authenticate to GitHub, read/decrypt the required encrypted `runtime-state` snapshot, and resolve a real product version. The deep watchdog checks:

- Worker health;
- latest validation health;
- public-repository privacy rules;
- cron-job.org job existence/cadence/target/enabled state;
- structural encryption of every canonical `runtime-state` file.

Watchdog problems/recovery are operational signals only. They do not send Telegram or Web Push messages.

Worker deployment also performs a notification-silent production-readiness smoke: `/health`, `/web/config`, `/web/next-game`, and `/web/calendar` must all succeed, and the web endpoints must return the expected Pages CORS origin. A green deploy therefore means the user-facing data path works, not merely that the Worker process started.

## Notification policy

Allowed proactive messages are limited to pickup RSVP/capacity alerts, real RATS schedule changes, and one combined version-change announcement per Pacific day. Telegram may also reply directly to authenticated user questions/commands.

Tests, builds, deploys, commits, pull requests, watchdog failures/recovery, setup reminders, invalid-setting reminders, and score-only changes are silent.

## Active workflow roles

The workflow set is split by failure domain:

- **runtime:** Pickup watcher, RATS league watcher, Telegram listener, System watchdog;
- **release/deploy:** Promote production release, Deploy GitHub Pages app, Deploy BallerWatch Worker, Deploy Calendar bridge, Web app runtime, Refresh match weather;
- **quality:** Validate code, Manual smoke test;
- **recovery/maintenance:** Repair external cron schedules, Purge current data, Publish wiki, Cleanup merged release branches.

**Repair external cron schedules** is manual-only. Normal Worker deployment already synchronizes the two cron-job.org jobs, so keeping another release-triggered scheduler workflow would be redundant.

## External schedules

cron-job.org has exactly two required enabled jobs:

- pickup: every 2 minutes;
- league: every 5 minutes.

The legacy Telegram polling job and retired external watchdog job must remain disabled.

System watchdog/weather runs natively in GitHub Actions every six hours. Manual watchdog execution requires the explicit fallback flag; a stray retired/default dispatch skips before runner allocation.

## Runtime-state migration/audit

Worker deployment pulls/pushes every runtime scope so legacy files are resealed as complete AES-GCM envelopes. In 5.8.2, legacy encrypted envelopes are also read once and resealed with the domain-separated runtime-encryption KDF. It then runs:

```bash
node shared/runtime-state.mjs audit
```

The six-hour watchdog repeats that structural audit. The audit names an offending file if needed but never prints decrypted content.

## RATS source resilience

The league watcher retries transient failures such as HTTP 429/502/503/504 and network timeouts with bounded backoff. If all retries fail and a validated schedule already exists, production keeps the last-good schedule and skips Calendar/notification changes for that refresh.

Cold starts, authentication failures, malformed schemas, and integrity mismatches fail closed.

## Calendar

The Apps Script bridge does not assume the Apps Script account's default Calendar is the BallerWatch Calendar.

Pairing uses a temporary non-sensitive marker event. The bridge finds exactly one marker, stores the Calendar ID only in private Script Properties, removes the marker, and uses that target for sync/purge.

No Calendar ID/email is committed or logged. Mutation fails closed when no target is paired.

## Match weather

The six-hour maintenance run builds a 14-day forecast for published pickup/league games. Forecasts use actual match windows rather than a generic daily value.

OpenStreetMap Nominatim geocodes uncached public venue names/addresses conservatively; coordinates are cached encrypted. Open-Meteo supplies hourly weather. Failed forecast reads may retain last-good weather as cached/stale.

The release/bootstrap **Refresh match weather** workflow remains notification-silent and separate from the recurring watchdog so deploy recovery is explicit.

## PWA operations

Pages is deployed from `docs/`. The client shows **Live** only after runtime-backed calendar and notification-board reads succeed; network/browser-online state or `/web/config` alone is never sufficient.

The Worker uses separate GitHub credentials by responsibility: `GITHUB_DISPATCH_TOKEN` is sourced from `CRON_GITHUB_PAT` for workflow dispatch only, while `GITHUB_CONTENTS_TOKEN` is sourced from `RELEASE_GITHUB_TOKEN` for encrypted `runtime-state` reads/writes. This prevents scheduler-token permission changes from silently taking the PWA data plane offline.

Pages is deployed from `docs/`. One-time repository setup is **Settings → Pages → Build and deployment → Source → GitHub Actions**.

**Web app runtime** maintains encrypted VAPID/subscription state. Subscribed devices do not require Telegram for delivery; GitHub Actions sends Web Push signals directly to browser push services.

Web Push delivery is an outbound-network security boundary. Only recognized browser push-service hosts are persisted; registration requires a short-lived endpoint-bound challenge from the trusted PWA origin. The GitHub runner revalidates the endpoint, resolves DNS immediately before delivery, requires every result to be public, and sends with redirects disabled. Rejected endpoints are removed from runtime state rather than retried indefinitely.

All third-party GitHub Actions are pinned to reviewed commit SHAs. Version comments beside the SHA are informational only; updating an Action means explicitly reviewing and replacing the pinned commit.

The Worker API emits defense-in-depth CSP, anti-framing, content-type, referrer, and permissions headers. GitHub Pages can only enforce the document-level CSP/referrer controls supplied in HTML; repository-defined custom response headers are not available on the static Pages hosting layer.

## Purge

**Purge current data**:

1. deletes only BallerWatch-managed RATS Calendar events;
2. clears generated `runtime-state`;
3. creates a fresh empty encrypted Web Push identity;
4. lets normal watchers rebuild current state/defaults.

Source code, repository/Worker secrets, and unrelated Calendar events are never deleted.

# Operations

## Normal schedules

- Pickup: every 2 minutes through cron-job.org → GitHub Actions.
- League: every 5 minutes through cron-job.org → GitHub Actions.
- Watchdog + weather: every 6 hours through native GitHub Actions.
- Release eligibility: hourly.
- Web/PWA API: event driven through Cloudflare.

The retired external watchdog schedule stays disabled.

## Notifications

Allowed proactive Web Push:
- pickup RSVP/capacity changes;
- real RATS schedule changes;
- one combined release notice per Pacific day.

Operational health, tests, deployments, commits, PRs, score-only changes, and setup reminders do not generate user notifications.

## Independent RATS schedule updates

The league watcher compares newly validated RATS fixtures with the previous
verified feed and writes a transient change list. The encrypted BallerWatch
notification board and Web Push record schedule alerts and one-hour reminders
without Google permissions or any external calendar. The built-in match
calendar combines pickup and league games for everyone, including guests.

## RATS results and standings freshness

A successful five-minute RATS league watcher validates the published team exports
against the source aggregate. When verified current-season scores or fixtures
change, the watcher reuses that public aggregate to advance the **encrypted**
historical results and rebuild the prepared standings/scouting projection.
No second RATS scrape or browser-side historical computation is needed.
The independent hourly historical crawl remains a fallback.

Standings timestamps represent the last **verified published results**, not the
last scheduled attempt. If the source fails, keep the last-known-good encrypted
data and leave its result timestamp unchanged. The absence of new scores is not
evidence that the league has published no updates; check the source's health.

**Active source incident, November 2, 2026:** Production league watcher logs
show DNS `ENOTFOUND` for its legacy RATS upstream host. Current standings
cannot be called live until an authoritative replacement feed is verified,
tested, and released through the protected Worker/Pages gates. Track the
incident in [issue #226](https://github.com/vudh1/ballerwatch/issues/226).
Avoid guessed feed URLs, manufactured scores, plaintext runtime exports, or
score-only Web Push notifications.

## Password recovery

1. Set temporary repository secret `BALLERWATCH_RECOVERY_PASSWORD`.
2. Run **Reset web user password** with confirmation `RESET`.
3. Verify success.
4. Delete/rotate the temporary secret.
5. Sign in to the PWA with the new password.

The reset also revokes existing signed-in devices.

## Factory reset

Run **Purge current data**, type `PURGE`. It deletes generated runtime state and reinitializes Web Push identity. Source code and repository/Worker secrets remain.

## Failure behavior

Cloudflare failure affects live PWA API/Q&A/board reads but does not stop cron-job.org pickup/league dispatch or native GitHub maintenance. Runtime-state read failure can use encrypted Actions-cache backup where supported. Invalid release/runtime credentials fail closed.

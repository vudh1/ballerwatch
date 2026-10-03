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

## Password recovery

1. Set temporary repository secret `BALLERWATCH_RECOVERY_PASSWORD`.
2. Run **Reset web user password** with confirmation `RESET`.
3. Verify success.
4. Delete/rotate the temporary secret.
5. Sign in to the PWA with the new password.

The reset also revokes existing signed-in devices.

## Factory reset

Run **Purge current data**, type `PURGE`. It deletes BallerWatch-managed Calendar events and generated runtime state, then reinitializes Web Push identity. Source code, repository/Worker secrets, and unrelated Calendar events remain.

## Failure behavior

Cloudflare failure affects live PWA API/Q&A/board reads but does not stop cron-job.org pickup/league dispatch or native GitHub maintenance. Runtime-state read failure can use encrypted Actions-cache backup where supported. Invalid release/runtime credentials fail closed.

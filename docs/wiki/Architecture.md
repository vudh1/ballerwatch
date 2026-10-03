# Architecture

BallerWatch separates the soccer domain model from delivery, storage, and scheduling providers.

## Runtime boundaries

```text
GitHub Pages PWA
       |
       v
Cloudflare web Worker
  |       |
  |       +--> encrypted runtime-state
  +----------> Web Push / user auth / public-safe Q&A

cron-job.org --> pickup + league GitHub workflows
GitHub schedule --> watchdog + weather
RATS changes --> Google Calendar bridge
```

- `main`: reviewed integration.
- `production`: exact promoted release commit.
- `runtime-state`: encrypted generated data only.
- `infra/web-worker/`: public-safe API, user authentication, push registration, edge refresh/read helpers.
- GitHub Actions: source reconciliation, Calendar updates, Web Push delivery, release promotion, recovery.
- cron-job.org: pickup every 2 minutes and league every 5 minutes.

Workers KV and Cloudflare Cron Triggers are intentionally disabled.

## Authentication

The PWA uses user-password sign-in. First-time bootstrap or forgotten-password recovery is performed by a repository administrator using the **Reset web user password** workflow and temporary `BALLERWATCH_RECOVERY_PASSWORD` secret.

Signed user tokens carry a server-side auth revision. Password changes, recovery resets, and global sign-out advance that revision and revoke earlier tokens.

## Notifications

Proactive user output is Web Push / notification-board only and is limited to pickup RSVP/capacity changes, real RATS schedule changes, and one combined release notice per Pacific day.

## Production pinning

Scheduled workflows execute `production`. Release-driven Worker deployment checks out the published tag/production ref. Pages checks out `production`; it is dispatched only after the Worker passes live readiness.

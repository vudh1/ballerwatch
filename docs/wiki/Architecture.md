# Architecture

BallerWatch separates the browser UI, backend runtime, encrypted generated state, and deployment control plane.

## Runtime boundaries

```text
frontend/web/ GitHub Pages PWA
  |-- app.js              view orchestration
  |-- lib/client.js       API/session transport
  |-- lib/notification-state.js local fallback + profile normalization
             |
             v
backend/infra/web-worker/ Cloudflare Worker
       |                       |
       |                       +--> encrypted runtime-state
       +--------------------------> auth / Q&A / push registration / API

cron-job.org --> GitHub Actions --> backend/pickup + backend/league
GitHub schedule --> backend/watchdog + backend/weather
RATS changes --> backend/league --> Google Calendar bridge
```

- `main`: reviewed integration source.
- `production`: exact promoted release commit.
- `runtime-state`: encrypted generated data only.
- `frontend/web/`: static installable PWA.
- `backend/`: server, watcher, reconciliation, encryption, scheduling, and integration source.
- GitHub Actions: source reconciliation, Calendar updates, Web Push delivery, release promotion, recovery.
- cron-job.org: pickup every 2 minutes and league every 5 minutes.

Workers KV and Cloudflare Cron Triggers are intentionally disabled.

## Source vs storage paths

The source tree is organized as `frontend/` and `backend/`. Runtime-state document names intentionally retain stable paths such as `pickup/state/feed.json` and `league/state/schedule.json`. This keeps encrypted storage compatibility independent from source-code organization.

## Authentication

The PWA uses username/password sign-in. First-time bootstrap or forgotten-password recovery is performed by a repository administrator through **Reset web user password** and the temporary `BALLERWATCH_RECOVERY_PASSWORD` secret.

Signed user tokens carry a server-side auth revision. Password changes, recovery resets, and global sign-out advance that revision and revoke earlier tokens.

## Accounts and notification state

The authenticated user document remains a complete AES-GCM encrypted runtime-state envelope. BallerWatch 7 adds a bounded notification profile per account containing read IDs, deleted IDs, and Pickup / League / App category preferences.

Notification mutations merge server-side instead of replacing the full profile, so actions from two signed-in devices converge without one device overwriting the other. Existing local notification state is migrated into the signed-in profile after authentication.

## Notifications

Proactive output is limited to the documented Web Push / notification-board policy. User-specific RSVP names, confirmation state, waitlist data, read/delete state, and preferences remain authenticated/encrypted-only.

Web Push remains payload-free. Subscription state can associate an endpoint with an account and category snapshot inside encrypted runtime state; delivery can skip categories before contacting the browser push service. The service worker also keeps the installed-app badge and local background category preferences synchronized.

## Production pinning

Scheduled workflows execute `production`. Release-driven Worker deployment checks out the published release. Pages also checks out `production` and deploys only after Worker readiness succeeds.

After an administrator requests promotion, an already-open PWA watches both the Worker version and Pages shell. Once both match the target release, it updates the service worker and reloads automatically.

# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes.

## Architecture and privacy

- `main` is reviewed integration code; `production` is the exact promoted release commit; `runtime-state` is generated encrypted state only.
- Every canonical `runtime-state` file must be a complete hardened AES-GCM envelope. Never persist readable runtime JSON, rosters, settings, chat text, notification data, identifiers, timestamps, secrets, push endpoints, or VAPID private material.
- The installable GitHub Pages PWA is the only user surface. Cloudflare hosts the web API, authentication, read-only Q&A, Web Push registration, runtime reads/writes, health, and edge refresh helpers.
- Core web operation requires `TRACKER_STATE_KEY`. Do not add a fallback encryption/signing secret.
- User settings live in encrypted `state/user.json`. Authenticated users may change only RSVP display name and monitored league teams.
- User password sign-in is the normal and only app sign-in mechanism. Recovery/bootstrap is repository-admin controlled through **Reset web user password**, using a temporary `BALLERWATCH_RECOVERY_PASSWORD` Actions secret. The recovery workflow must never print the plaintext password and must advance the server-side auth revision to revoke older sessions.
- User capability tokens carry the server-side auth revision and expire after at most 90 days. Password rotation, recovery reset, and explicit global sign-out revoke prior tokens.
- Wrong-answer feedback uses a short-lived token scoped to the exact answer and grants no settings capability.
- Exact authenticated Q&A, and anonymous Q&A explicitly marked wrong, may be retained encrypted for at most 48 hours. The engineering-review projection is privacy-minimized and encrypted.
- Web Push VAPID keys/subscriptions live only in encrypted `state/web-push.json`. Registration and delivery must keep provider allowlisting, endpoint-bound challenges, IP/userinfo/port rejection, DNS public-address validation, and redirects disabled.
- Public notification-board entries must never include RSVP/waitlist names, private settings, tokens, or user-specific status.
- Workers KV and Cloudflare Cron Triggers are not part of production.
- `RELEASE_GITHUB_TOKEN` / Worker `GITHUB_CONTENTS_TOKEN` owns encrypted runtime content reads/writes. `CRON_GITHUB_PAT` / Worker `GITHUB_DISPATCH_TOKEN` is dispatch-only.
- cron-job.org runs only pickup every 2 minutes and league every 5 minutes. The external watchdog schedule remains retired. Native GitHub watchdog/weather maintenance runs every 6 hours.
- Every external `uses:` dependency in workflows must be pinned to a reviewed 40-character SHA.
- To recover or verify `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the live endpoint.

## Release workflow

Every repository change starts on a dedicated branch from latest `main`. Never do normal work directly on `main`.

- Product: `release/<version>`
- Maintenance/docs/refactor/workflows: `maintenance/<topic>`
- Focused fix: `fix/<topic>`

Product release flow:

1. Implement on the release branch.
2. Run **Validate code** and, for runtime-affecting changes, the notification-silent **Manual smoke test**.
3. Fix failures; do not bypass them.
4. Update `features/versions.json` and current documentation only after implementation is green.
5. Re-run final validation/smoke.
6. Open a PR to `main`.
7. Squash merge only after checks are green.
8. Production promotion publishes the GitHub Release and advances `production`.
9. Release-driven Worker deployment must pass runtime migration/audit plus live `/health`, `/web/config`, `/web/next-game`, and `/web/calendar` checks before it dispatches Pages deployment.
10. Pages always checks out `production`. A path-scoped `main` trigger exists only to recover the Pages workflow itself.

`RELEASE_GITHUB_TOKEN` is repository-scoped and needs Contents read/write, Workflows read/write, Pages read/write, and Administration read/write. Promotion/deployment fails closed if required release, runtime, or Pages actions cannot complete. The default automatic path waits 24 hours; only then may a published GitHub Release/tag promote the validated commit.

## Notification policy

Production may proactively deliver only through Web Push / the web notification board:

- pickup RSVP/capacity changes;
- real RATS schedule changes;
- one combined release announcement per Pacific day.

Do not send Web Push for watchdog failures/recovery, tests, smoke runs, builds, deploys, commits, PRs, score-only changes, setup reminders, or engineering/health events.

Tests, audits, smoke tests, and temporary verification runs must never send Web Push or mutate Google Calendar.

## Runtime-state behavior

- Canonical web user state is `state/user.json`.
- The 6.0 migration may read the previous encrypted user-state filename solely to move it into `state/user.json`; the next snapshot write must compact the old filename away.
- Runtime snapshot writes remain parentless one-snapshot branch updates.
- A successful readable `runtime-state` branch is authoritative, including missing files after PURGE. Cache recovery must never resurrect intentionally purged state.
- Encrypted Actions-cache backups are secondary recovery only.

## Watchdog

The watchdog verifies Worker readiness/runtime decryptability, latest validation health, public-repo privacy rules, and the two required cron-job.org schedules. Operational health failures do not trigger user notifications.

## Versioning

Version numbers represent **actual product changes**, not repository activity.

- PATCH: backward-compatible user-visible reliability/privacy/security/compatibility fix.
- MINOR: new backward-compatible capability.
- MAJOR: intentional breaking product change.
- No SemVer bump for documentation-only edits, behavior-preserving refactors, tests, formatting/comments, CI/workflow maintenance, or tooling-only work.

Release entries may include `webAnnouncement` for user-facing release notices. Do not create a release entry merely for commits or PRs.

## Code and testing

Read `STYLE_GUIDE.md` before editing.

Repository source boundaries are deliberate:

- browser/PWA source lives under `frontend/web/`;
- server, watcher, state, scheduling, and integration source lives under `backend/`;
- test-only source stays under `tests/`, split into `tests/frontend/` and `tests/backend/`;
- maintained documentation lives under `docs/wiki/`; the animated README demo lives at `docs/demo.gif`;
- canonical runtime-state paths such as `pickup/state/` and `league/state/` are storage contracts, not source directories, and must not be renamed as part of source refactors.

- Keep runtime modules domain-focused.
- Every non-test runtime `.mjs` starts with module documentation.
- Keep provider-specific integrations at the edges.
- Test-only source belongs under `tests/`.
- Use encrypted/synthetic runtime fixtures.
- Never upload decrypted runtime artifacts.
- Maintain the repository regression check that rejects reintroduction of the retired messaging integration, its credentials, webhook route, and removed source/workflow paths.

## PURGE

PURGE removes BallerWatch-managed Calendar events, generated encrypted runtime files, user settings, monitored-team overrides, Web Push subscriptions/board state, watchdog state, weather/Calendar snapshots, and retained chat/review state. It does not delete source code, repository/Worker secrets, or unrelated Calendar events. Defaults and current source snapshots rebuild on later runs.

## Failure behavior

- Cloudflare unavailable: live PWA API/Q&A/board reads are unavailable; pickup/league schedules and native GitHub maintenance continue.
- Runtime branch unavailable: supported workflows may use encrypted last-known cache backup.
- Release/content credential invalid: promotion/Worker readiness fails closed.
- Web Push delivery is independent from Cloudflare once a subscription is stored; GitHub Actions sends directly to validated browser push providers.

# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes.

## Architecture and privacy

- `main` is reviewed integration code and automatically publishes a **frontend-only beta** after successful main CI; `production` is the exact promoted release commit behind the root URL; `runtime-state` is generated encrypted state only. Never deploy a beta commit as the root app or silently advance `production` from a beta update.
- Every canonical `runtime-state` file must be a complete hardened AES-GCM envelope. Never persist readable runtime JSON, rosters, settings, chat text, notification data, identifiers, timestamps, secrets, push endpoints, or VAPID private material.
- The installable GitHub Pages PWA is the only user surface. Cloudflare hosts the web API, authentication, read-only Q&A, Web Push registration, runtime reads/writes, health, and edge refresh helpers.
- Core web operation requires `TRACKER_STATE_KEY`. Do not add a fallback encryption/signing secret.
- RSVP display names, monitored teams and match-card edits persist privately per device without an account or fixed expiry; notification messages/read/deleted state/badges expire after 24 hours.
- Encrypted `state/user.json` retains protected administrator maintenance credentials; general visitor sign-in and account-backed settings were retired in 11.0.0.
- Administrator maintenance tokens remain session-only and cannot alter another visitor's locally edited match cards.
- Wrong-answer feedback uses a short-lived token scoped to the exact answer and grants no settings capability.
- Exact authenticated Q&A, and anonymous Q&A explicitly marked wrong, may be retained encrypted for at most 48 hours. The engineering-review projection is privacy-minimized and encrypted.
- Web Push VAPID keys/subscriptions live only in encrypted `state/web-push.json`. Registration and delivery must keep provider allowlisting, endpoint-bound challenges, IP/userinfo/port rejection, DNS public-address validation, and redirects disabled.
- Public notification-board, calendar and AI responses never include RSVP/waitlist names, private settings, tokens or user-specific status. The only exception is the on-demand `/web/rsvp-roster` view for an individually published pickup date, with names, guest counts, original order and a boolean pending-withdrawal flag per entry. Never publish an all-date participant catalog, unpublished rosters, contact information or private metadata.
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
10. Pages composes its root from `production` and its `/beta/` subtree from a pinned, successfully validated `main` commit. Successful `main` CI publishes beta automatically; an explicit production rollout still follows the release/Worker readiness gate. Legacy `/v2/` routes alias beta.

`RELEASE_GITHUB_TOKEN` is repository-scoped and needs Contents read/write, Workflows read/write, Pages read/write, and Administration read/write. Promotion/deployment fails closed if required release, runtime, or Pages actions cannot complete. Production promotion is manual-only through protected administrator action; merging to main never automatically advances production or publishes a GitHub Release.

## Notification policy

Production may proactively deliver only through Web Push / the web notification board:

- pickup RSVP/capacity changes;
- real RATS schedule changes;
- one combined release announcement per Pacific day.

Do not send Web Push for watchdog failures/recovery, tests, smoke runs, builds, deploys, commits, PRs, score-only changes, setup reminders, or engineering/health events.

Tests, audits, smoke tests, and temporary verification runs must never send Web Push.

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

PURGE removes generated encrypted runtime files, user settings, monitored-team overrides, Web Push subscriptions/board state, watchdog state, weather snapshots, and retained chat/review state. It does not delete source code or repository/Worker secrets. Defaults and current source snapshots rebuild on later runs.

## Failure behavior

- Cloudflare unavailable: live PWA API/Q&A/board reads are unavailable; pickup/league schedules and native GitHub maintenance continue.
- Runtime branch unavailable: supported workflows may use encrypted last-known cache backup.
- Release/content credential invalid: promotion/Worker readiness fails closed.
- Web Push delivery is independent from Cloudflare once a subscription is stored; GitHub Actions sends directly to validated browser push providers.

# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes. Do not rely on an older scheduler prompt when the repository says something newer.

## Privacy and architecture

- GitHub contains source code, static configuration, documentation, and release history only. **Never commit runtime state back into the repository.**
- Private/persistent runtime state belongs in the private Cloudflare `ballerwatch-runtime` KV namespace.
- Workflows may temporarily materialize runtime files by using `shared/runtime-state.mjs pull <scope>`; they must push needed changes back to KV and remove local state before completion.
- The privacy audit must continue to reject tracked `pickup/state/`, `league/state/`, `state/`, `league/status.json`, `requests/private.json`, and `requests/unknown.json`.
- The public feature-request summary is served from the Worker `/public/feature-summary` endpoint and must remain version 3 fixed categories/counters only. Never expose free text, IDs, timestamps, hashes of request text, or rejected answers.
- Cloudflare Cron Triggers are the recurring scheduler. cron-job.org contains three emergency fallback jobs (pickup, league, watchdog); they should exist but remain disabled while Cloudflare is healthy.
- Telegram is webhook-driven through Cloudflare. Do not recreate a recurring `getUpdates` poller.
- To recover or verify `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the live endpoint.

## Release workflow

Normal product/repository changes should use **one release branch per target version**, named `release/<version>`.

Direct commits to `main` remain permitted for emergencies or explicit user-directed maintenance, but the default process is:

1. Start `release/<next-version>` from the latest `main`.
2. Make as many implementation/fix commits as needed on that branch.
3. **Do not bump `features/versions.json` yet.**
4. Run/verify **Validate code**. Release PRs also run the notification-silent **Manual smoke test** when runtime code is affected.
5. Fix all failures on the branch. Do not hide or bypass a failed check.
6. Only after the implementation is tested, update `features/versions.json` to the target version and add/update any warranted announcement.
7. Run the final validation again.
8. Open or update the PR to `main`, mark it ready, and prefer automated approval/auto-merge when repository settings allow it.
9. Merge with **squash merge only**, so `main` receives exactly one commit for that release.
10. Delete the release branch after merge.

The resulting `main` history should be release-oriented: one commit per BallerWatch version. Do not merge release branches with merge commits or rebase-merge.

## Testing

Tests, audits, smoke tests, and temporary verification runs must **not send Telegram messages**.

Use the notification-silent `/admin/shadow-refresh` path or **Manual smoke test** for live-source verification. Release-PR smoke tests are serialized so obsolete runs do not hammer upstream sources.

Normal production listener/pickup/league runs may send their intended Telegram notifications.

For RATS changes, preserve the fast path that tries the last known season before broader discovery and fetches independent team schedule exports concurrently.

## Watchdog

The watchdog must verify:

- Cloudflare webhook/KV and source heartbeat health;
- latest validation health;
- public-repo privacy rules; and
- cron-job.org fallback posture.

While Cloudflare is healthy, the three cron-job.org fallback jobs must exist with their expected 2/5/10-minute cadences and remain disabled. A legacy Telegram polling cron must remain disabled.

## Versioning

- PATCH: backward-compatible fix, reliability, privacy, source compatibility, or internal improvement.
- MINOR: new backward-compatible capability.
- MAJOR: intentional breaking change.
- No repository change means no version bump.

Announcements must reference an exact release version and preserve one-time announcement behavior.

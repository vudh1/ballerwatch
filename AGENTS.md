# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes. Do not rely on an older scheduler prompt when the repository says something newer.

## Privacy and architecture

- GitHub contains source code, static configuration, documentation, and release history only. **Never commit runtime state back into the repository.**
- Private/persistent runtime state belongs in the private Cloudflare `ballerwatch-runtime` KV namespace.
- Workflows may temporarily materialize runtime files by using `shared/runtime-state.mjs pull <scope>`; they must push needed changes back to KV and remove local state before completion.
- The privacy audit must continue to reject tracked `pickup/state/`, `league/state/`, `state/`, `requests/private.json`, and `requests/unknown.json`.
- The public feature-request summary is served from the Worker `/public/feature-summary` endpoint and must remain version 3 fixed categories/counters only. Never expose free text, IDs, timestamps, hashes of request text, or rejected answers.
- Cloudflare Cron Triggers are the recurring scheduler. Keep cron-job.org BallerWatch jobs disabled during healthy operation; deployment may restore them automatically as a failure fallback. Do not add GitHub `schedule:` cron.
- Telegram is webhook-driven through Cloudflare. Do not recreate a recurring `getUpdates` poller.
- To recover or verify `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the live endpoint.

## Change process

Direct commits to `main` are allowed for normal maintenance.

1. Start from the latest `main`.
2. Make the smallest safe change.
3. Update `features/versions.json` when repository/product behavior changes.
4. Run or verify **Validate code**.
5. For Worker/runtime changes, verify the deployment's notification-silent edge check and KV scope round-trip.
6. If validation or deployment fails, fix it promptly or revert the change.

## Testing

Tests, audits, smoke tests, and temporary verification runs must **not send Telegram messages**.

Use the notification-silent `/admin/shadow-refresh` path or **Manual smoke test** for live-source verification.

Normal production listener/pickup/league runs may send their intended Telegram notifications.

## Versioning

- PATCH: backward-compatible fix, reliability, privacy, source compatibility, or internal improvement.
- MINOR: new backward-compatible capability.
- MAJOR: intentional breaking change.
- No repository change means no version bump.

Announcements must reference an exact release version and preserve one-time announcement behavior.

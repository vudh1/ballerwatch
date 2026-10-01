# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes. Do not rely on an older scheduler prompt when the repository says something newer.

## Privacy and architecture

- Keep this public repository free of secrets and readable live/private soccer data.
- Public feature-request summaries may contain only version 2 fixed categories and counts. Never restore free text, IDs, timestamps, or hashes of request text. Exact requests require private authorized decryption; do not infer them from categories.
- Runtime plaintext belongs only in ignored temporary paths. Persistent private state must stay encrypted.
- Cloudflare Cron Triggers are the target recurring scheduler. Keep cron-job.org jobs only as a fallback until the KV-backed edge cutover is verified; do not add GitHub `schedule:` cron.
- Telegram is webhook-driven through Cloudflare. Do not recreate a recurring `getUpdates` poller.
- To recover or verify `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the live endpoint.

## Change process

Direct commits to `main` are allowed for normal maintenance.

1. Start from the latest `main`.
2. Make the smallest safe change.
3. Update `features/versions.json` in the same change set when the repository/product changed.
4. Run or verify **Validate code** after the change.
5. If validation fails, fix it promptly or revert the change.

A branch and pull request may still be used for larger/riskier work, but they are not required.

## Testing

Cloudflare cutover verification must use the notification-silent `/admin/shadow-refresh` path before legacy schedules are disabled.

Tests, audits, smoke tests, and temporary verification runs must **not send Telegram messages**. Do not call Telegram notification code just to prove a test worked. Use workflow results/logs that contain no private participant, team, field, address, or other live soccer details.

Normal production listener/pickup/league runs may send their intended Telegram notifications.

## Versioning

- PATCH: backward-compatible fix, reliability, privacy, source compatibility, or internal improvement.
- MINOR: new backward-compatible capability.
- MAJOR: intentional breaking change.
- No repository change means no version bump.

Announcements must reference an exact release version and must preserve the bot's one-time announcement behavior.

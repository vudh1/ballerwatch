# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes. Do not rely on an older scheduler prompt when the repository says something newer.

## Privacy and architecture

- Keep this public repository free of secrets and readable live/private soccer data.
- Runtime plaintext belongs only in ignored temporary paths. Persistent private state must stay encrypted.
- Keep cron-job.org as the recurring scheduler. Do not add GitHub `schedule:` cron.
- Keep exactly one Telegram `getUpdates` consumer.
- To recover or verify `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the live endpoint.

## Change process

Normal code, workflow, documentation, configuration, and product changes must use:

1. Start from the latest `main`.
2. Create a new branch.
3. Make the smallest safe change.
4. Update `features/versions.json` in the same change set when the repository/product changed.
5. Open a pull request to `main`.
6. Wait for **Validate code** to pass.
7. Merge the PR. Never commit the change directly to `main`.

If validation fails, fix the same branch/PR. If the change cannot be safely completed, leave `main` unchanged and report the blocker.

The only direct-main exception is automated encrypted/generated runtime state written by trusted GitHub Actions workflows. Do not use that exception for code or maintenance changes.

Scheduled ChatGPT tasks follow the same branch + PR rule.

## Versioning

- PATCH: backward-compatible fix, reliability, privacy, source compatibility, or internal improvement.
- MINOR: new backward-compatible capability.
- MAJOR: intentional breaking change.
- No repository change means no version bump.

Announcements must reference an exact release version and must preserve the bot's one-time announcement behavior.

# BallerWatch

BallerWatch is a small soccer automation system for **pickup games** and **Seattle RATS league games**.

It runs in GitHub Actions, sends Telegram updates, keeps Google Calendar in sync, and stores private soccer data encrypted.

**Current version: 1.4.2**

## What it does

- Checks the pickup RSVP source every **2 minutes**.
- Checks Seattle RATS schedules every **5 minutes**.
- Checks Telegram commands every **1 minute**.
- Runs a watchdog every **10 minutes** and retries a component when it becomes stale or fails.
- Sends pickup, waitlist, schedule, score, and setup notifications through Telegram.
- Syncs changed RATS games to Google Calendar.
- Keeps private runtime data encrypted in the public repository.
- Lets monitored RATS teams be added, removed, or renamed through Telegram.

Recurring runs come from cron-job.org. BallerWatch intentionally does **not** use GitHub's built-in scheduled cron.

## League teams

A fresh setup includes built-in default monitored teams. The actual default names stay in code rather than this README. After the first run, the encrypted team list becomes the saved configuration and Telegram can add, remove, or rename teams.

Useful commands include:

- `what league teams are you monitoring?`
- `add league team <name>`
- `remove league team <name>`
- `rename league team <old> to <new>`
- `/setup`
- `/version`
- `/help`

## Main workflows

| Action | Purpose |
| --- | --- |
| **Telegram listener** | Reads Telegram commands every minute. |
| **Pickup watcher** | Refreshes pickup RSVP data every 2 minutes. |
| **RATS league watcher** | Refreshes league schedules every 5 minutes and syncs Calendar changes. |
| **System watchdog** | Checks health every 10 minutes and retries failed/stale components. |
| **Manual smoke test** | Runs a notification-silent end-to-end test without changing Calendar or normal notification state. |
| **Purge current data** | Deletes current generated snapshots so the system can rebuild them from clean state. |
| **Configure external cron** | Creates/updates the cron-job.org schedules. |
| **Deploy Calendar bridge** | Deploys the Google Apps Script Calendar bridge. |
| **Configure repository** | Sets the GitHub repository description. |

## Purge current data

Use **Actions → Purge current data → Run workflow** and type:

`PURGE`

The purge removes current generated data:

- pickup snapshots and notification state
- league schedule/today/Calendar snapshots
- league health/status
- watchdog state
- stored feature suggestions

It **does not** remove:

- GitHub Actions secrets
- source code or version history
- Telegram listener settings, update offset, or announcement history
- encrypted league team configuration
- Google Calendar events

The normal scheduled workflows will fetch fresh data again after the purge.

## Privacy

This is a public repository, so private runtime information is never intentionally stored as readable tracked files.

Pickup and league state is encrypted with AES-256-GCM. Plaintext is allowed only temporarily inside a GitHub Actions runner and is removed before state is committed.

Unsupported Telegram questions are stored only in encrypted `requests/private.json`. Public `requests/unknown.json` contains only fixed categories and aggregate counts—no text, request IDs, or timestamps. Commit times and changing counts still reveal activity. Existing public summaries remain in Git history; this change does not rewrite history.

Feature builders may use public categories to prioritize general improvements. Exact requests require authorized access to the encrypted archive in a private runtime; never publish decrypted text or guess the original request from a category.

For new installations, set `TRACKER_STATE_KEY` to a dedicated cryptographically random value of at least 32 bytes, stored only as a GitHub Actions secret. Never use a human-chosen password.

For existing installations, `TRACKER_STATE_KEY` is optional for compatibility. If it is not set, the existing `TELEGRAM_BOT_TOKEN` is used as the encryption-key source. Do not simply add or replace this secret: existing ciphertext would become unreadable. A migration must pause all state-writing workflows, decrypt and re-encrypt every protected file (including listener settings and watchdog state) using the old and new keys in a private runtime, verify the results, update the secret and ciphertext together while writers are paused, then resume. Keep the old key securely until rollback is no longer needed. Key rotation does not remove historical ciphertext from Git.

The GitHub connector used for repository maintenance cannot manage Actions secrets. Dedicated-key rotation must be completed through an authorized secrets-management path; this release does not change the active encryption key.

## Required secrets

Core:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `OWNER_RSVP_NAME`
- `UPSTREAM_ENDPOINT`
- `TRACKER_STATE_KEY` — optional

Calendar:

- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`

cron-job.org:

- `CRON_JOB_ORG_API_KEY`
- `CRON_GITHUB_PAT`

Apps Script deployment:

- `CLASPRC_JSON`
- `APPS_SCRIPT_ID`
- `APPS_SCRIPT_DEPLOYMENT_ID`

Repository setup:

- `REPO_ADMIN_TOKEN` — optional one-time fine-grained token with **Administration: read/write** if you want the **Configure repository** action to set the GitHub description.

Never commit any of these values.

## Initial setup

1. Add the required GitHub Actions secrets.
2. Run **Configure external cron**.
3. Run **Deploy Calendar bridge**.
4. Optionally run **Configure repository** once to set the repo description.
5. Run **Manual smoke test**. Tests do not send Telegram messages.
6. Confirm listener, pickup, league, watchdog, Telegram, and Calendar behavior during normal scheduled operation.

For pickup endpoint recovery, follow `skills/find-upstream-endpoint/SKILL.md`. Do not put the live endpoint in source code.

## Repository changes

Direct commits to `main` are allowed. Before changing the repository, maintenance agents should read the current `AGENTS.md`, `README.md`, and `features/versions.json` so they use the latest behavior and version.

Changes must still be validated. Tests and smoke tests must not send Telegram messages. Production watcher runs may send their normal notifications.

## Validation

**Validate code** checks:

- JavaScript syntax
- release/version history
- privacy rules
- watchdog tests
- league tests

Run or verify this validation after repository changes.

## Versioning

BallerWatch uses Semantic Versioning:

- **MAJOR** — breaking change
- **MINOR** — new backward-compatible feature
- **PATCH** — backward-compatible fix or internal/reliability/privacy improvement

The full history is in `features/versions.json`.

### Latest — v1.4.2

- Public feature requests now expose only fixed categories and counts.
- Original request text, IDs, and timestamps remain encrypted.
- Privacy checks reject extra public fields and run before listener state is committed.
- Regression tests cover personal details and prevent overwriting an archive when decryption fails.

### Previous — v1.4.1

- Direct commits to `main` are allowed again; PR-only repository protection is no longer part of BallerWatch setup.
- Manual smoke testing is notification-silent and does not send Telegram messages.
- Default monitored team names were removed from this README; the defaults remain in code.
- Scheduled ChatGPT maintenance still syncs from the current repository before making changes and validates changes afterward.

Recent reliability fixes also recover manually deleted Calendar events and safely persist state when multiple workflows finish at the same time.

## Repository maintenance

Start with `AGENTS.md`.

Important rules:

- Keep secrets and live/private soccer data out of readable tracked files.
- Do not add GitHub `schedule:` cron jobs.
- Keep exactly one Telegram `getUpdates` consumer.
- Direct commits to `main` are allowed, but validate every repository change.
- Update `features/versions.json` whenever the product/repository changes.
- Do not bump the version when nothing changed.

# BallerWatch

BallerWatch is a small soccer automation system for **pickup games** and **Seattle RATS league games**.

It runs in GitHub Actions, sends Telegram updates, keeps Google Calendar in sync, and stores private soccer data encrypted.

**Current version: 1.4.0**

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

## Default league teams

A fresh setup starts with these teams, in priority order:

1. **Third Touch FC**
2. **PhoSaiGon**

After the first run, the encrypted team list becomes the saved configuration. Telegram can still change it.

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
| **Manual smoke test** | Runs a safe end-to-end test without changing Calendar or normal notification state. |
| **Purge current data** | Deletes current generated snapshots so the system can rebuild them from clean state. |
| **Configure external cron** | Creates/updates the cron-job.org schedules. |
| **Deploy Calendar bridge** | Deploys the Google Apps Script Calendar bridge. |
| **Configure repository** | Sets the repo description and protects `main` with PR-only code changes. |

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

`TRACKER_STATE_KEY` is optional. If it is not set, the existing `TELEGRAM_BOT_TOKEN` is used as the encryption-key source. Do not add a new state key to an existing installation without a planned key rotation.

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

- `REPO_ADMIN_TOKEN` — one-time fine-grained token with **Administration: read/write** for this repository. Run **Configure repository**, then this secret may be removed.

Never commit any of these values.

## Initial setup

1. Add the required GitHub Actions secrets.
2. Run **Configure external cron**.
3. Run **Deploy Calendar bridge**.
4. Run **Configure repository** once to set the repo description and protect `main`.
5. Run **Manual smoke test**.
6. Confirm listener, pickup, league, watchdog, Telegram, and Calendar behavior.

For pickup endpoint recovery, follow `skills/find-upstream-endpoint/SKILL.md`. Do not put the live endpoint in source code.

## Protecting main

Normal code/config/documentation changes must use:

`branch → pull request → Validate code → merge to main`

Direct human or ChatGPT code commits to `main` are not allowed.

The **GitHub Actions app is the only bypass**. It needs that exception because listener/pickup/league/watchdog workflows save encrypted runtime state directly to `main`. The manual purge action also uses this controlled automation path.

Scheduled ChatGPT maintenance tasks must read the current `AGENTS.md`, `README.md`, and `features/versions.json` before changing anything. If they make a repository change, they must create a branch and PR rather than writing directly to `main`.

## Validation

**Validate code** checks:

- JavaScript syntax
- release/version history
- privacy rules
- watchdog tests
- league tests

PRs to `main` must pass this validation before merging.

## Versioning

BallerWatch uses Semantic Versioning:

- **MAJOR** — breaking change
- **MINOR** — new backward-compatible feature
- **PATCH** — backward-compatible fix or internal/reliability/privacy improvement

The full history is in `features/versions.json`.

### Latest — v1.4.0

- Added the manual **Purge current data** action.
- Added PR-only governance for normal changes to `main`, while keeping a narrow GitHub Actions bypass for encrypted runtime state.
- Added one-time repository setup for the GitHub description and main-branch ruleset.
- Simplified this README and updated maintenance guidance so scheduled ChatGPT tasks always start from the current repository state.

Recent reliability fixes also recover manually deleted Calendar events and safely persist state when multiple workflows finish at the same time.

## Repository maintenance

Start with `AGENTS.md`.

Important rules:

- Keep secrets and live/private soccer data out of readable tracked files.
- Do not add GitHub `schedule:` cron jobs.
- Keep exactly one Telegram `getUpdates` consumer.
- Use a branch and PR for normal repository changes.
- Update `features/versions.json` whenever the product/repository changes.
- Do not bump the version when nothing changed.

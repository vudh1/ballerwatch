# BallerWatch

One public, zero-cost soccer automation repo with three independently scheduled components:

1. **Telegram listener** — poll every **1 minute**
2. **Pickup watcher** — refresh every **2 minutes**
3. **RATS league watcher** — refresh every **5 minutes**

There is intentionally **no GitHub Actions `schedule:` cron**. All recurring runs are started by cron-job.org through `workflow_dispatch`. The cron-job.org configuration itself is now managed idempotently by `.github/workflows/setup-cron.yml`.

## Architecture

```text
cron-job.org
  ├─ every 1 min ──> listener.yml ──> Telegram getUpdates (long poll)
  │                                  ├─ decrypts pickup/state/feed.json
  │                                  └─ decrypts league/state/today.json
  │
  ├─ every 2 min ──> pickup.yml ────> RSVP source
  │                                  ├─ plaintext only in .runtime/
  │                                  ├─ encrypted pickup/state/*
  │                                  └─ Telegram RSVP notifications
  │
  └─ every 5 min ──> league.yml ────> Seattle RATS
                                     ├─ plaintext only inside runner
                                     ├─ encrypted league/state/*
                                     ├─ Google Calendar bridge
                                     └─ Telegram schedule/score notifications
```

The Telegram bot has exactly **one** `getUpdates` consumer: the listener. This avoids two repositories or workflows racing and consuming each other's Telegram messages.

## Telegram

Examples:

- `what game is today?`
- `what games are today?`
- `/setup`
- `/version` — current SemVer release and latest changes
- `what information do you still need from me?`
- `what is my owner name?`
- `owner name <exact RSVP display name>`
- `change owner name to <new name>`
- `what league teams are you monitoring?`
- `add league team <name>`
- `rename league team <old> to <new>`
- `remove league team <name>`
- `what's the count for 10/8?`
- `don't watch 10/8`
- `watch 10/8 again`
- `snooze for 30 minutes`
- `unsnooze`
- `/help`

## Encrypted user setup

`OWNER_RSVP_NAME` and `UPSTREAM_ENDPOINT` are GitHub Actions Secrets that act as private defaults. Telegram can optionally set encrypted overrides for either value without revealing the default secret. The bot asks for the exact RSVP display name when it is missing and can report setup status with `/setup`. While the name is missing, or while a configured name does not match any participant/waitlist name in non-empty current RSVP data, the listener sends at most one reminder per 24 hours. League-team configuration is handled the same way.

Credentials such as Telegram tokens, `TRACKER_STATE_KEY`, and Calendar webhook credentials remain secret-only. `OWNER_RSVP_NAME` and `UPSTREAM_ENDPOINT` remain GitHub Secrets as defaults; Telegram may store an encrypted override when the name no longer matches or the endpoint becomes unhealthy.

## Encrypted league team configuration

The monitored RATS team list is managed through Telegram and stored with AES-256-GCM encryption in `league/state/teams.json`, using `TRACKER_STATE_KEY` (or the Telegram token fallback) as key material. The league schedule, today's-game snapshot, and Calendar snapshot are also persisted encrypted under `league/state/`. The workflow decrypts them only inside the Actions runner and deletes all plaintext copies before committing.

Team matching remains case-insensitive and whitespace-normalized. The bot refuses to remove the last configured league team.

On the first listener or league run after migration, the legacy plaintext team config is encrypted automatically. On the first league run, the legacy plaintext schedule/today/Calendar snapshots are also encrypted and removed from the repository.

Today's-game replies combine both sources and can include:

- Pickup / TTF game
- RATS game + watched team
- Start time
- Field/location
- Google Maps link
- Jersey color when RATS publishes it

## Secrets

Add these repository Actions secrets before cutover:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TRACKER_STATE_KEY` — optional dedicated state-encryption key; when unset, BallerWatch intentionally falls back to `TELEGRAM_BOT_TOKEN`
- `OWNER_RSVP_NAME`
- `UPSTREAM_ENDPOINT`
- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`
- `CRON_JOB_ORG_API_KEY` — cron-job.org Settings → API key
- `CRON_GITHUB_PAT` — fine-grained GitHub token restricted to this repo with Actions read/write
- `CLASPRC_JSON` — OAuth credentials produced by `clasp login`; treat as highly sensitive
- `APPS_SCRIPT_ID` — Script ID for the existing Calendar bridge Apps Script project (Project Settings → IDs)
- `APPS_SCRIPT_DEPLOYMENT_ID` — active versioned web-app deployment ID

`TRACKER_STATE_KEY` is optional. If the migrated system never had one, leave it unset during cutover so existing encrypted state continues using the same `TELEGRAM_BOT_TOKEN` fallback. Do not introduce a new state key during migration without an explicit key-rotation procedure.

`UPSTREAM_ENDPOINT` is the normal pickup RSVP backend used by the public RSVP frontend, not its admin endpoint. To recover or verify it without hardcoding the live value here, follow `skills/find-upstream-endpoint/SKILL.md`.

Use the **same existing secret values** where applicable so encrypted state and the Calendar bridge continue working.

## Operational runbooks

Repository-maintenance agents should start with `AGENTS.md`. The endpoint recovery procedure lives in `skills/find-upstream-endpoint/SKILL.md`; it explains how to trace the public RSVP frontend to the normal data backend, distinguish it from the admin endpoint, verify the required read actions, and keep the live endpoint out of tracked source.

## cron-job.org — automated provisioning

Do **not** create the four jobs manually. Add `CRON_JOB_ORG_API_KEY` and `CRON_GITHUB_PAT` as repository Actions secrets, then run **Configure external cron** from GitHub Actions.

`infra/sync-cron.mjs` uses the cron-job.org REST API to create or update exactly these BallerWatch jobs:

- listener — every 1 minute
- pickup — every 2 minutes
- league — every 5 minutes
- watchdog — every 10 minutes

Each job POSTs `{"ref":"main"}` to the corresponding GitHub `workflow_dispatch` endpoint. The GitHub PAT is sent to cron-job.org only as the private Authorization header required for those future dispatches; it is never committed or printed. Saved cron responses are disabled.

Provisioning is idempotent: rerunning the workflow updates existing BallerWatch jobs rather than duplicating them. By default it also disables enabled cron jobs that still target `ballerbaywatch`, `ttf-watcher`, or `rats-league-watcher`, but only after all four BallerWatch jobs have been synced.

## Google Apps Script — automated deployment

The Calendar bridge can also be deployed from GitHub. Add these Actions secrets:

- `CLASPRC_JSON` — contents of the OAuth credential file created by `clasp login`
- `APPS_SCRIPT_ID` — Script ID of the existing Calendar bridge project (Project Settings → IDs)
- `APPS_SCRIPT_DEPLOYMENT_ID` — the existing active web-app deployment ID
- existing `GOOGLE_CALENDAR_WEBHOOK_URL` — used to verify the deployed bridge

Then run **Deploy Calendar bridge** once. Future changes to `league/google_apps_script/Code.gs` deploy automatically.

The deployment workflow first pulls the existing Apps Script project so its manifest and any other project files are preserved, overwrites only `Code.gs` from this repository, pushes the project, and updates the existing versioned deployment. Updating the existing deployment preserves its webhook URL.

The existing Apps Script Script Property `WEBHOOK_SECRET` remains private inside Apps Script and must already match `GOOGLE_CALENDAR_WEBHOOK_SECRET`. The workflow does not copy that secret into source code.

Before using CI deployment, enable the Apps Script API for the Google account and allow Apps Script API access to projects. Service accounts are intentionally not used because the Apps Script API does not support them.

## Cost

Keep this repository **public** and use standard GitHub-hosted runners. Public-repository standard Actions runners are free; cron-job.org is free and supports execution as often as every minute.

## Migration / cutover

Do not run two Telegram listeners against the same bot token.

1. Add the secrets above.\n2. Run **Configure external cron**; leave cleanup enabled to disable superseded soccer cron jobs after successful sync.\n3. Run **Deploy Calendar bridge** once after adding the clasp secrets.\n4. Run the manual smoke test and verify listener/pickup/league/watchdog activity.\n5. Leave old repositories intact only until the new system is verified, then delete/archive them as desired.

## Versioning and release history

BallerWatch uses Semantic Versioning: `MAJOR.MINOR.PATCH`.

- **MAJOR** — intentional breaking behavior/configuration change
- **MINOR** — new user-facing capability that remains backward compatible
- **PATCH** — backward-compatible bug fix, reliability, privacy, source-compatibility, or internal improvement

The canonical ledger is `features/versions.json`. It stores `currentVersion` plus every release's date, bump type, source, title, and change list. `features/announcements.json` references these versions for Telegram announcements.

Any scheduled ChatGPT task that commits a product change must update the ledger in the **same change set**. Feature Builder changes normally bump MINOR; watcher audit fixes normally bump PATCH. A scheduled task must not bump the version when it makes no repository change.

`infra/validate-versions.mjs` enforces valid SemVer, newest-first unique releases, current-version consistency, and valid announcement version references.

## Self-improving Telegram requests

If the Telegram listener cannot match a question to a supported command, it records a deduplicated request in `requests/unknown.json`. A separate ChatGPT feature-builder task reviews open requests every three days and may implement small/medium safe features. After implementing a feature, it should append an entry to `features/announcements.json`; the bot announces the newest unseen feature once.

Unsupported Telegram questions are saved in two forms:

- `requests/unknown.json` contains a privacy-redacted version for the ChatGPT feature builder. Known owner/player/team/opponent/field/address/division values plus dates, times, and URLs are replaced with placeholders.
- `requests/private.json` contains the original question encrypted with the same state encryption used elsewhere.

The feature builder reads only the redacted queue. No Telegram chat ID is stored with requests.


### Watchdog

Create one additional cron-job.org dispatch every **10 minutes**:

`https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/watchdog.yml/dispatches`

The watchdog verifies listener/pickup/league freshness, the latest validation result, encrypted-state decryptability, and absence of tracked plaintext match feeds. If the listener, pickup watcher, or league watcher is stale/failed, it can dispatch that exact workflow again. Recent active runs block duplicate recovery, and retries are throttled to a 10-minute cooldown. Validation/privacy/configuration problems alert without blind recovery. It sends Telegram only for a new incident or recovery.

## Manual smoke test

`.github/workflows/manual-test.yml` is workflow-dispatch only. It refreshes the real pickup source, refreshes RATS using the encrypted monitored-team config, exercises the real pickup selection logic, and sends one private Telegram summary. It does not call Google Calendar, does not send normal watcher notifications, and does not commit the test refresh.


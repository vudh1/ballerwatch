# BallerWatch

One public, zero-cost soccer automation repo with three independently scheduled components:

1. **Telegram listener** — poll every **1 minute**
2. **Pickup watcher** — refresh every **2 minutes**
3. **RATS league watcher** — refresh every **5 minutes**

There is intentionally **no GitHub Actions `schedule:` cron**. All recurring runs are started by cron-job.org through `workflow_dispatch`.

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
- `TRACKER_STATE_KEY`
- `OWNER_RSVP_NAME`
- `UPSTREAM_ENDPOINT`
- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`

Use the **same values** currently used by `ttf-watcher` / `rats-league-watcher` so encrypted state and the Calendar bridge continue working.

## cron-job.org

Create three jobs. Each sends a POST with body:

```json
{"ref":"main"}
```

and headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer <GITHUB_PAT>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

Endpoints:

- 1 minute — `https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/listener.yml/dispatches`
- 2 minutes — `https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/pickup.yml/dispatches`
- 5 minutes — `https://api.github.com/repos/vudh1/ballerwatch/actions/workflows/league.yml/dispatches`

The PAT needs permission to run Actions for this repository.

## Cost

Keep this repository **public** and use standard GitHub-hosted runners. Public-repository standard Actions runners are free; cron-job.org is free and supports execution as often as every minute.

## Migration / cutover

Do not run two Telegram listeners against the same bot token.

1. Add the secrets above.
2. Create and test the three cron-job.org jobs.
3. Stop the old cron-job.org jobs for `ttf-watcher` and `rats-league-watcher`.
4. Leave the old repositories intact temporarily as rollback copies.
5. After the new system is stable, archive the old repositories if desired.

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


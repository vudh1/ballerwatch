# BallerWatch

BallerWatch is a small soccer automation system for pickup games and Seattle RATS league games.

It uses Telegram for questions and alerts, Cloudflare Workers for the webhook/fast reply path, cron-job.org for scheduling, GitHub Actions for watcher/reconciliation work, Gemini Flash with Groq fallback for bounded AI assistance, and Google Calendar for league match sync.

**Current version: 2.8.0**

## Recent changes

- **2.8.0** — Unified Node.js runtime.
- **2.7.5** — RATS transient-source resilience.
- **2.7.4** — Index-independent Calendar pairing.
- **2.7.3** — Pair Calendar bridge to intended target.

Full release history and Telegram announcement text live in `features/versions.json`.

## Architecture

```text
Telegram
   |
   v
Cloudflare Worker
   |-- common read-only question --> GitHub runtime-state snapshot
   |                                + short Workers Cache
   |                                --> Telegram reply
   |
   '-- state-changing/unsupported --> GitHub listener Action

cron-job.org
   |-- every 2 min  --> Pickup watcher
   |-- every 5 min  --> RATS league watcher
   '-- every 10 min --> System watchdog
                         |
                         v
                    GitHub Actions
                         |
                         +--> runtime-state branch
                         +--> Telegram alerts
                         '--> Google Calendar when needed
```

Cloudflare has **no Workers KV binding** and **no Cloudflare Cron Triggers** in the production configuration.

## Telegram behavior

Telegram sends updates to the Cloudflare webhook.

Common read-only questions are answered directly by the Worker when possible:

- today's game
- next game
- pickup count / capacity
- field and time
- monitored league teams
- bot version
- help

The Worker reads an encrypted snapshot from the `runtime-state` branch and caches it briefly with the Workers Cache API. This avoids starting a GitHub Action for ordinary questions.

Commands that change state, or questions the fast path cannot safely answer, are dispatched to the GitHub listener.

Examples:

```text
/version
/setup
/feature <request>
snooze for 30 minutes
don't watch 10/8
add league team <name>
```

## 48-hour Telegram review history

BallerWatch no longer automatically turns every unanswered question into a feature request.

Instead:

1. a Telegram exchange is shortened and privacy-cleaned with Groq;
2. the condensed record is stored for at most **48 hours**;
3. the detailed condensed history is AES-GCM encrypted in `state/chat-history.json` on the `runtime-state` branch;
4. only actionable, sanitized signals are copied to `state/chat-review.json`.

The readable review file can contain only:

- `bug_candidate`
- `feature_candidate`
- `negative_feedback`
- timestamp
- short technical summary
- short reason

It must not contain raw Telegram text, names, IDs, tokens, URLs, exact addresses, or quoted messages.

This lets the scheduled ChatGPT maintenance task look for bugs and worthwhile feature ideas without needing the repository encryption key or retaining full chat text.

Explicit `/feature <request>` is still supported when you intentionally want to submit a feature request.

Replying **👎** to a bot answer records that exchange as negative feedback for review rather than automatically creating a feature request.

## Pickup watcher

cron-job.org dispatches the pickup GitHub Action every **2 minutes**.

The workflow:

1. loads encrypted runtime state from `runtime-state`;
2. reads the current RSVP source;
3. compares with prior state;
4. sends Telegram notifications only when the production rules require them;
5. writes only changed encrypted state back to `runtime-state`;
6. removes local runtime files.

The GitHub workflow remains responsible for the mature notification rules.

## RATS league watcher

cron-job.org dispatches the RATS league workflow every **5 minutes**.

The workflow:

1. restores monitored teams and last-known league state;
2. checks the most likely current season first;
3. retrieves independent team schedules concurrently with bounded retries for transient source failures;
4. retains a previously validated last-good schedule when RATS is temporarily unavailable;
5. compares schedules and scores;
6. sends league notifications when appropriate;
7. updates Google Calendar only when the applied Calendar snapshot differs;
8. persists changed encrypted state.

This avoids unnecessary Calendar calls when nothing changed.

## Watchdog

cron-job.org dispatches the watchdog every **10 minutes**.

It checks:

- Cloudflare Telegram webhook health;
- latest repository validation health;
- privacy rules;
- cron-job.org scheduler existence, cadence, target, and enabled state.

The watchdog does not require Workers KV.

## Runtime storage

### `main`

`main` is release-oriented. It contains code, static configuration, docs, tests, and release history.

Generated runtime data must not be committed to `main`.

### `runtime-state`

The dedicated `runtime-state` branch is the durable state store.

Private files remain encrypted before being written there, including:

- listener settings/state
- pickup snapshots and notification state
- league teams/schedule/today/Calendar reconciliation state
- watchdog state
- explicit private feature-request archive
- 48-hour condensed Telegram history

The only intentionally readable runtime-derived files are privacy-minimized summaries such as the chat review signal file and feature-request category summary.

Keeping state on its own branch prevents frequent runtime commits from cluttering the version history on `main`.

## Runtime-state concurrency

A workflow records the blob hash of every state file it loaded.

When it finishes, it pushes only files that actually changed during that run. This prevents a pickup or league workflow from rewriting unrelated state it merely read.

Runtime pushes retry on branch races so overlapping watcher/listener runs do not silently discard each other's changes.

## Scheduling

| Work | Cadence | Primary executor |
| --- | --- | --- |
| Pickup watcher | Every 2 minutes | cron-job.org → GitHub Action |
| RATS watcher | Every 5 minutes | cron-job.org → GitHub Action |
| System watchdog | Every 10 minutes | cron-job.org → GitHub Action |
| Telegram webhook | Event-driven | Cloudflare Worker |
| Fast Telegram read-only reply | Event-driven | Cloudflare Worker |
| State-changing Telegram command | Event-driven | GitHub listener |
| Calendar sync | Only when league snapshot requires it | GitHub Action |

There is no GitHub `schedule:` cron and no Cloudflare Cron Trigger.

## Cloudflare outage behavior

Cloudflare is still the Telegram webhook endpoint, so a total Cloudflare outage temporarily prevents new inbound Telegram commands and fast replies.

Core monitoring continues independently:

- cron-job.org still dispatches pickup/league/watchdog;
- GitHub Actions can still retrieve soccer sources;
- GitHub can still send watcher notifications directly to Telegram;
- league Calendar reconciliation can continue;
- runtime state remains on GitHub rather than Cloudflare.

## GitHub/runtime-state failure behavior

If the runtime-state branch cannot be read, workflows can restore an encrypted last-known copy from GitHub Actions cache.

If a Worker cannot directly save a fast-path chat-history entry, it can dispatch the GitHub listener as a persistence fallback.

## Privacy

The repository is public, so the storage boundary is strict:

- secrets stay in GitHub/Cloudflare secret stores;
- private runtime payloads on `runtime-state` are AES-256-GCM encrypted;
- plaintext runtime data exists only temporarily inside a Worker invocation or GitHub runner;
- raw Telegram conversation text is not persisted as chat history;
- chat review output is sanitized before it becomes readable;
- `privacy-audit.mjs` prevents runtime paths from being tracked on `main`.

The state encryption key comes from `TRACKER_STATE_KEY`. Existing compatibility fallback to `TELEGRAM_BOT_TOKEN` remains supported.

## AI usage

BallerWatch keeps AI bounded and optional. Deterministic intent matching and action handling remain authoritative.

For safe natural-language answering, Gemini Flash is tried first. If Gemini is unavailable, rate-limited, or cannot answer, BallerWatch falls back to Groq and then deterministic/non-AI handling where appropriate. Groq remains responsible for privacy-minimized chat condensation. Models receive no action tools.

## Google Calendar

The league watcher keeps an applied Calendar snapshot in encrypted runtime state.

Google Calendar is called only when a future league match materially needs to be created or updated. Deleting a managed event can therefore be repaired when the watcher detects that the applied state no longer matches.

## Manual purge

Run **Actions → Purge current data** and type:

```text
PURGE
```

The action removes generated files from the `runtime-state` branch, including:

- pickup and league snapshots
- Calendar reconciliation state
- notification/watchdog state
- listener settings
- custom monitored-team state
- 48-hour chat history/review
- explicit private feature-request runtime data

It does **not** delete:

- source code
- repository or Worker secrets
- unrelated Google Calendar events

BallerWatch-managed RATS Calendar events are deleted by the authenticated Calendar bridge before runtime state is cleared.

The next watcher runs rebuild current source state and built-in defaults.

## Important workflows

| Workflow | Purpose |
| --- | --- |
| **Pickup watcher** | Refresh RSVP state and send pickup alerts |
| **RATS league watcher** | Refresh league schedules/scores and reconcile Calendar |
| **Telegram listener** | Handle state-changing or unsupported Telegram commands |
| **System watchdog** | Validate service/scheduler health |
| **Deploy Telegram webhook** | Deploy the webhook-only Cloudflare Worker |
| **Deploy Calendar bridge** | Deploy and verify the Apps Script Calendar bridge |
| **Validate code** | Style, syntax, tests, privacy audit |
| **Manual smoke test** | Notification-silent live-source verification |
| **Purge current data** | Factory-reset generated runtime state |
| **Configure external cron** | Create/repair the 2/5/10-minute cron-job.org schedules |
| **Publish wiki** | Mirror `docs/wiki/` into the GitHub Wiki when configured |
| **Cleanup merged release branches** | Remove stale `release/*` and `fix/*` branches |

## Required secrets

### Telegram

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### Runtime encryption and setup

- `TRACKER_STATE_KEY`
- `OWNER_RSVP_NAME`
- `UPSTREAM_ENDPOINT`

### GitHub / external scheduler

- `CRON_GITHUB_PAT`
- `CRON_JOB_ORG_API_KEY`

### Cloudflare

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

A Workers KV namespace is **not required** in 2.4.0.

### Groq

- `GROQ_API_KEY`

### Google Calendar bridge

- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`

### Optional Wiki publishing

- `WIKI_TOKEN`

## Development

Read these before making changes:

- `AGENTS.md`
- `STYLE_GUIDE.md`
- `features/versions.json`
- `docs/wiki/`

Normal releases use `release/<version>`, run validation and the notification-silent smoke test, then squash merge to `main`.

Runtime code and tests use dependency-free Node.js 22 / ECMAScript modules; Python is no longer required by BallerWatch workflows.

All test-only code lives under `tests/`, mirroring the source areas. Production folders should contain runtime code only.

Do not send Telegram messages from tests.

## Repository goals

BallerWatch should remain:

- fast for normal Telegram questions;
- inexpensive to operate;
- resilient when one infrastructure provider is unavailable;
- conservative about private data;
- simple enough to maintain and onboard;
- release-oriented on `main`;
- able to learn from short-lived, privacy-minimized feedback without keeping raw chat logs.

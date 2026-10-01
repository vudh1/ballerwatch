# BallerWatch

BallerWatch is a small soccer automation system for pickup games and Seattle RATS league games.

It uses Telegram for questions and alerts, Cloudflare Workers for the webhook/fast reply path, cron-job.org for scheduling, GitHub Actions for watcher/reconciliation work, Gemini Flash with Groq fallback for bounded AI assistance, and Google Calendar for league match sync.

**Current version: 2.7.1**

## What changed in 2.7.1

2.7.1 hardens the full Calendar reset introduced in 2.7.0. Purging continues past stale/inaccessible tracked event IDs, scans legacy marker-tagged events in bounded yearly windows, and reports a safe bridge error if anything still cannot be removed.

The Calendar deployment workflow now verifies that the live bridge is version 3 or newer before allowing a full reset.

## What changed in 2.7.0

2.7.0 makes **Purge current data** a true BallerWatch factory reset. It now removes BallerWatch-managed RATS match events from the Calendar bridge before clearing generated runtime state. Unrelated Calendar events are not touched.

The Calendar bridge tracks its own event IDs privately and also uses the explicit `RATS tracking key:` description marker as a safety net for older BallerWatch events whose private mapping may be missing.

The repository workflow audit also removed two obsolete workflows:

- `Configure repository` — one-time repository administration that is no longer part of normal operations.
- `Seed failover cache` — redundant because pickup, league, and watchdog already refresh their encrypted failover cache on every production run.

Twelve active workflows remain for production monitoring, Telegram/Calendar deployment, validation/smoke, cron configuration, purge, wiki sync, and branch cleanup.

## What changed in 2.6.0

2.6.0 makes Telegram intentionally quiet outside soccer updates and direct replies. The bot now sends proactive Telegram messages only for:

- pickup RSVP/capacity notifications from the existing watcher logic;
- real RATS match-schedule changes;
- one combined version-change announcement per Pacific day.

Direct replies to your Telegram questions continue normally.

Watchdog failures/recovery, CI/tests, build/deploy activity, commits/PRs, unsolicited setup reminders, endpoint/name reminders, and score-only changes do not send Telegram messages.

If several versions are released before the next allowed daily announcement, BallerWatch combines them into one message. Release announcements use user-facing version summaries from `features/versions.json`; they do not include commit or pull-request details.

## What changed in 2.5.6

2.5.6 makes pickup monitoring resilient to a retired RSVP backend deployment. The encrypted override or `UPSTREAM_ENDPOINT` secret remains the primary endpoint. If it is absent or returns HTTP 404/410, BallerWatch rediscovers the normal public Apps Script URL from the RSVP frontend and retries the read.

The rediscovered URL is used only in memory for that run; it is never committed, logged, or written into runtime state. Live notification-silent smoke verified this recovery path against the current RSVP frontend.

Repository cleanup now removes inactive `fix/*` branches as well as stale `release/*` branches.

## What changed in 2.5.5

2.5.5 tightens the single-snapshot runtime model: the `runtime-state` branch now contains only the canonical generated runtime files. Repository source, workflows, documentation, and release files are excluded from runtime snapshots.

PURGE therefore produces an empty parentless snapshot, and subsequent watcher/listener writes rebuild only current encrypted runtime state while retaining the one-commit branch history.

## What changed in 2.5.4

2.5.4 keeps `runtime-state` as a current snapshot instead of an accumulating history. Every successful runtime write now publishes a new parentless root commit containing the complete current encrypted state, so older runtime commits are no longer reachable from the branch.

Writes still use an optimistic lease and retry against the latest snapshot so pickup, league, listener, and watchdog updates do not intentionally overwrite a newer concurrent state. PURGE also produces a single root snapshot.

A repository cleanup workflow removes stale `release/*` branches after they no longer have an open pull request.

## What changed in 2.5.3

2.5.3 uses the privacy-minimized 48-hour chat review as an engineering feedback loop. Repeated failures around schedule wording are now covered by deterministic routing and regression tests instead of relying on the model to guess.

The bot now understands common variations such as today's schedule, games on a specific date, pickup-game details, and next/recommended-game questions. Date-specific answers can combine pickup and RATS league data, and the bounded Gemini/Groq fallback now receives upcoming league schedule context when deterministic routing does not match.

This is deliberate "learning" without automatic model retraining: reviewed patterns become tested routing/examples while raw Telegram conversations remain private and short-lived.

## What changed in 2.5.2

2.5.2 enforces the webhook-only Telegram architecture. The GitHub listener no longer falls back to Telegram `getUpdates` when a workflow dispatch has no Telegram update payload.

Cloudflare fast-path history-only dispatches are handled directly, and empty listener dispatches safely do nothing. When cron-job.org management API access is available, scheduler synchronization also disables any legacy Telegram polling schedule.

## What changed in 2.5.1

2.5.1 extends the temporary cron-job.org API-outage policy to post-merge operations. If the cron-job.org management API is temporarily unavailable or quota-limited, scheduler setup and Telegram Worker deployment emit warnings instead of failing after the core deployment has already succeeded.

Authentication failures still fail. When cron-job.org can be queried, missing, disabled, duplicated, mistargeted, or wrong-cadence scheduler jobs also still fail verification.

## What changed in 2.5.0

2.5.0 adds Gemini Flash as the preferred bounded natural-language answer path. If Gemini is unavailable, rate-limited, or cannot safely answer, BallerWatch falls back to Groq and then deterministic/non-AI handling where appropriate.

This release also hardens runtime recovery after PURGE: when the `runtime-state` branch is readable, it is authoritative even when a generated file is intentionally absent, so stale recovery caches cannot recreate purged data.

cron-job.org remains the primary 2/5/10-minute scheduler. The watchdog now checks cron-job.org's management API only every six hours (four routine reads per day). Release smoke treats temporary API unavailability such as HTTP 429 as a warning, but still fails when the API responds and the scheduler configuration is actually missing, disabled, duplicated, or misconfigured.

The notification-silent smoke test also preserves a valid last-good league snapshot when the RATS source itself is temporarily unavailable (for example HTTP 503). Parser/schema errors, authentication failures, and invalid stored state still fail the test.

## What changed in 2.4.1

2.4.1 explicitly publishes an empty Cloudflare Cron Trigger list and verifies after deployment that the Worker has zero scheduled triggers. This fixes a cutover detail where omitting the Wrangler `triggers` field leaves previously deployed Cron Triggers in place.

## What changed in 2.4.0

BallerWatch no longer uses Cloudflare Workers KV as its runtime database. This removes the daily KV request-limit risk that appeared when frequent 2/5/10-minute checks and Telegram reads were all using KV.

The new design is:

- **Cloudflare Worker:** Telegram webhook and fast read-only answers.
- **Workers Cache API:** short-lived best-effort cache for fast replies and context. No Workers KV calls.
- **cron-job.org:** primary scheduler.
- **GitHub Actions:** pickup, league, listener fallback, watchdog, Calendar sync, deployments, tests.
- **`runtime-state` branch:** durable generated state, separate from release history on `main`.
- **GitHub Actions cache:** encrypted last-known backup if runtime-state cannot be read.
- **Groq:** bounded natural-language routing and short privacy-minimized chat review summaries.

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
3. retrieves independent team schedules concurrently;
4. compares schedules and scores;
5. sends league notifications when appropriate;
6. updates Google Calendar only when the applied Calendar snapshot differs;
7. persists changed encrypted state.

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
- Google Calendar events

The next watcher runs rebuild current source state and built-in defaults.

## Important workflows

| Workflow | Purpose |
| --- | --- |
| **Pickup watcher** | Refresh RSVP state and send pickup alerts |
| **RATS league watcher** | Refresh league schedules/scores and reconcile Calendar |
| **Telegram listener** | Handle state-changing or unsupported Telegram commands |
| **System watchdog** | Validate service/scheduler health |
| **Deploy Telegram webhook** | Deploy the webhook-only Cloudflare Worker |
| **Validate code** | Style, syntax, tests, privacy audit |
| **Manual smoke test** | Notification-silent live-source verification |
| **Purge current data** | Factory-reset generated runtime state |
| **Configure external cron** | Create/repair the 2/5/10-minute cron-job.org schedules |
| **Publish wiki** | Mirror `docs/wiki/` into the GitHub Wiki when configured |

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

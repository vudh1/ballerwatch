# BallerWatch

BallerWatch is a privacy-first soccer assistant for pickup games and Seattle RATS league games.

It combines **Telegram**, **Cloudflare Workers + KV**, **GitHub Actions**, **Groq**, and **Google Calendar** to monitor soccer data, answer questions, send useful alerts, and keep league matches synchronized.

**Current version: 2.3.0**

## Architecture

BallerWatch is Cloudflare-first. GitHub is the source-code, configuration, CI, deployment, and release-history platform — **not the runtime database**.

```text
                         Telegram
                            │
                            ▼
                    Cloudflare Worker
                 ┌──────────┼──────────┐
                 │          │          │
          fast answers   AI intent   state-changing /
                 │        routing     fallback request
                 │          │          │
                 └──────┬───┘          ▼
                        │          GitHub Action
                        ▼               │
                 Private Cloudflare KV │
                        │               │
          ┌─────────────┼───────────────┘
          │             │
          ▼             ▼
   pickup check      RATS check
    every 2 min      every 5 min
          │             │
          └── changed? ─┘
                 │
                 ▼
          GitHub reconciliation
          only when needed
                 │
        ┌────────┴─────────┐
        ▼                  ▼
   Telegram alerts    Google Calendar
```

Cloudflare also runs a **10-minute health trigger** for runtime/watchdog coordination.

## What changed in 2.1

Runtime data is no longer committed to this public repository.

The following now live only in private Cloudflare KV:

- pickup snapshots and private RSVP data
- pickup notification state
- monitored league-team configuration
- RATS schedule and today-game snapshots
- Calendar reconciliation state
- Telegram listener settings and offsets
- snooze/mute/setup state
- feature-request archive and aggregate summary
- watchdog state
- short conversation context
- edge source fingerprints and health timestamps
- AI usage counters

GitHub Actions may temporarily materialize compatible state files inside an ephemeral runner so the mature listener/notification/Calendar code can run. The workflow then pushes the updated state back to KV and deletes the local copy.

**No runtime-state workflow commits or pushes those files to GitHub.**

The privacy audit fails if runtime-state paths become tracked again.

## Telegram

Telegram is the primary user interface.

A Telegram message reaches the Cloudflare Worker through a webhook rather than a polling job. The Worker immediately sends the `typing...` state.

Common read-only questions stay entirely on Cloudflare, for example:

- `what game is today?`
- `what's my next game?`
- `what's the count for Thursday?`
- `what field?`
- `what time?`
- `how many spots?`
- `what league teams are you monitoring?`
- `/version`
- `/help`

Short conversation context allows follow-ups such as:

```text
what's the count for Thursday?
what field?
what time?
```

State-changing or unsupported requests are dispatched to the GitHub listener, which pulls its current state from KV, processes the command, writes the result back to KV, and exits without modifying the repository.

Examples include:

- snooze / unsnooze
- mute / re-enable
- add/remove/rename league team
- owner-name or endpoint configuration
- `/feature <request>`
- thumbs-down feedback

## Pickup monitoring

Cloudflare checks the pickup source every **2 minutes**.

It maintains the current pickup snapshot in KV and compares source fingerprints. If nothing changed, no GitHub runner is started.

When relevant source data changes, Cloudflare dispatches the existing pickup GitHub Action. That workflow:

1. pulls notification/settings state from KV;
2. refreshes and validates the pickup source;
3. determines whether a Telegram notification is needed;
4. pushes updated notification/runtime state back to KV;
5. removes local runtime files.

## RATS league monitoring

Cloudflare checks the RATS source every **5 minutes** using a lightweight change signal.

When nothing changed, GitHub does not run.

When the source changes, Cloudflare starts the RATS league workflow. The workflow then performs the full validated schedule retrieval, score-change handling, Calendar comparison, and Google Calendar synchronization.

To keep this reconciliation fast, the watcher tries the last known valid season first instead of probing future seasons on every run, and independent team schedule exports are fetched concurrently. The live release-PR smoke test records `leagueWatcherSeconds` so regressions are visible before merge.

The applied Calendar snapshot is stored in KV, so Calendar is only contacted when a future match materially needs to be created or updated.

## AI

Deterministic parsing always runs before AI.

Most common natural-language questions are routed through a small deterministic intent index before any AI call. Groq is used only as a bounded language-understanding fallback rather than as the source of soccer facts.

Current free-tier safety limits:

- **Cloudflare intent classification:** up to 25 calls per UTC day
- **GitHub fallback answering:** up to 25 calls per UTC day
- **Total intended maximum:** 50 AI calls per UTC day
- edge classification timeout: **1.2 seconds**
- GitHub fallback timeout: **2.5 seconds**

AI can classify a natural-language request, but actual counts, dates, fields, teams, and scores come from BallerWatch state.

AI cannot directly change RSVP, Calendar, settings, or repository code.

## Feature requests and feedback

Unsupported questions can be queued with:

```text
/feature <request>
```

If a response is wrong, reply directly to that bot message with:

```text
👎
```

Exact request text and rejected answers remain private in KV.

A privacy-safe aggregate summary is available from the Worker at:

```text
https://ballerwatch-telegram.vudhone.workers.dev/public/feature-summary
```

That endpoint exposes only fixed categories and counters. It does not expose original questions, IDs, timestamps, or rejected answers.

## Services

| Service | Responsibility |
| --- | --- |
| **Telegram Bot API** | User interface, alerts, typing state, bot replies |
| **Cloudflare Worker** | Webhook, fast replies, intent routing, source checks, health coordination |
| **Cloudflare KV** | Authoritative private runtime datastore |
| **GitHub repository** | Source code, static configuration, docs, release history |
| **GitHub Actions** | CI, deployment, reconciliation, writes, fallback commands, smoke tests |
| **Groq** | Optional free AI language/intent fallback |
| **Seattle RATS** | League source |
| **Pickup RSVP source** | Pickup-game RSVP source |
| **Google Apps Script** | Secure Calendar bridge |
| **Google Calendar** | Synchronized league schedule |
| **cron-job.org** | Independent external failover dispatcher; always enabled, with pickup/league work health-gated against Cloudflare |

## Runtime schedule

| Component | Frequency | Runs where |
| --- | ---: | --- |
| Pickup source check | Every 2 minutes | Cloudflare |
| RATS source check | Every 5 minutes | Cloudflare |
| Runtime health coordination | Every 10 minutes | Cloudflare |
| Telegram listener | Event-driven fallback | GitHub Action |
| Pickup reconciliation | Only when Cloudflare detects change | GitHub Action |
| RATS reconciliation | Only when Cloudflare detects change | GitHub Action |
| Validation | Relevant code/config changes | GitHub Action |

cron-job.org keeps three emergency fallback jobs for pickup, league, and watchdog. A healthy deployment ensures those jobs exist with the expected 2/5/10-minute cadences but keeps them disabled. If an edge deployment fails before verified activation, the deployment workflow can enable them as a safety fallback.

## Cloudflare outage behavior

Cloudflare is the preferred fast runtime, but it is no longer the only scheduler path.

- cron-job.org continues dispatching pickup every 2 minutes, league every 5 minutes, and watchdog every 10 minutes.
- When Cloudflare is healthy, pickup/league fallback runs exit after a lightweight health check.
- When Cloudflare is unavailable or stale, GitHub performs the full source refresh.
- GitHub workflows restore last-known runtime files from an **encrypted GitHub Actions cache** if the Worker runtime-state API cannot be reached.
- Telegram delivery from GitHub remains independent of Cloudflare.

A total Cloudflare outage still makes the Worker-hosted fast Q&A/web API unavailable until Cloudflare recovers, but the core soccer monitoring/Telegram fallback can continue through cron-job.org + GitHub Actions.

## Code style and onboarding

Repository-wide conventions are documented in [STYLE_GUIDE.md](STYLE_GUIDE.md). CI enforces whitespace, source-file documentation headers, syntax, privacy rules, and unit tests.

Long-form onboarding and operations documentation lives in `docs/wiki/` and is synchronized to the repository's GitHub Wiki after changes land on `main`.

## Privacy model

This repository is public, so runtime/private data is deliberately excluded from Git history.

The privacy audit forbids tracked files under:

```text
pickup/state/
league/state/
state/
requests/private.json
requests/unknown.json
league/status.json
```

Runtime state is kept in the private `ballerwatch-runtime` Cloudflare KV namespace.

Many compatibility records remain AES-256-GCM encrypted before they are placed in KV. Cloudflare also holds normalized hot snapshots privately so the Worker can answer quickly without starting GitHub.

Plaintext private data can exist temporarily inside an authenticated Cloudflare Worker invocation or an ephemeral GitHub Actions runner. It is not intentionally committed to this repository.

### Encryption key

Use a dedicated random `TRACKER_STATE_KEY` of at least 32 bytes.

For compatibility, existing installations can fall back to `TELEGRAM_BOT_TOKEN` as the encryption-key source if `TRACKER_STATE_KEY` is absent. Do not change the encryption-key source without migrating existing encrypted KV records.

## System watchdog

Cloudflare maintains pickup and league source heartbeats.

The deeper GitHub watchdog verifies:

- Cloudflare webhook/runtime health
- pickup heartbeat freshness
- RATS heartbeat freshness
- KV availability
- latest code-validation status
- repository privacy rules
- cron-job.org failover-job existence, cadence, target, and enabled posture

All three cron-job.org failover jobs must exist and remain enabled. A legacy Telegram polling cron must remain disabled.

It no longer expects pickup or league GitHub workflows to run on fixed intervals.

## Main GitHub workflows

| Workflow | Purpose |
| --- | --- |
| **Telegram listener** | State-changing and fallback Telegram requests |
| **Pickup watcher** | Notification/reconciliation after a pickup source change |
| **RATS league watcher** | Full league validation, score alerts, Calendar reconciliation |
| **System watchdog** | Deep validation/privacy/edge-health check |
| **Validate code** | Syntax, tests, Worker bundle, privacy audit |
| **Deploy Telegram webhook** | Deploy Worker/KV bindings, verify sources and all KV state scopes |
| **Manual smoke test** | Notification-silent live pickup/RATS verification |
| **Purge current data** | Clears generated runtime data from KV |
| **Deploy Calendar bridge** | Deploys the Apps Script Calendar bridge |
| **Configure external cron** | Maintains the disabled cron-job.org fallback posture |

## Purge current data

`PURGE` is a runtime factory reset. It deletes all keys from the private Cloudflare KV namespace, including custom league-team runtime state, so the next league run bootstraps the built-in default teams again. It also clears contexts, feature requests, AI counters, notification/watchdog state, and generated snapshots. Source code, GitHub/Worker secrets, and existing Google Calendar events are not deleted.

Use:

**Actions → Purge current data → Run workflow**

Enter:

```text
PURGE
```

The purge removes every current KV runtime key. Cloudflare rebuilds current soccer snapshots on subsequent edge checks, and league-team configuration returns to the built-in defaults unless changed again afterward.

## Required secrets

### Core

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `OWNER_RSVP_NAME`
- `UPSTREAM_ENDPOINT`
- `TRACKER_STATE_KEY` — recommended

### Groq

- `GROQ_API_KEY`

BallerWatch is intended to stay on Groq's free tier. Without this secret, unsupported requests fall back without AI.

### Cloudflare

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_KV_NAMESPACE_ID` — optional if the deployment token can find/create the namespace

The KV namespace is named `ballerwatch-runtime`.

### GitHub dispatch / fallback scheduler

- `CRON_GITHUB_PAT`
- `CRON_JOB_ORG_API_KEY`

### Google Calendar bridge

- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`
- `CLASPRC_JSON`
- `APPS_SCRIPT_ID`
- `APPS_SCRIPT_DEPLOYMENT_ID`

Never commit secret values.

## Initial setup

1. Add the required GitHub Actions secrets.
2. Register a Cloudflare Workers `workers.dev` subdomain.
3. Create or allow deployment to create the `ballerwatch-runtime` KV namespace.
4. Run **Deploy Telegram webhook**.
5. Run **Deploy Calendar bridge**.
6. Run **Manual smoke test**.
7. Verify the Cloudflare health endpoint and Telegram behavior.

For pickup endpoint recovery, follow `skills/find-upstream-endpoint/SKILL.md`.

Never put the live pickup endpoint in source code.

## Validation and maintenance

The **Validate code** workflow checks:

- JavaScript syntax
- Cloudflare Worker bundling
- edge-runtime tests
- release/version history
- repository privacy rules
- feature-request privacy behavior
- external fallback scheduler tests
- league tests

Before making repository changes, read:

- `AGENTS.md`
- `README.md`
- `features/versions.json`

## Release branches and main history

Normal changes are developed on a `release/<version>` branch. Implementation can use many commits on that branch, but the version is not bumped until the branch has passed validation and any relevant notification-silent live smoke test.

After tests pass:

1. update `features/versions.json` and any warranted announcement on the release branch;
2. run final validation;
3. open/update the PR to `main`;
4. use squash merge so the complete release becomes **one commit on main**;
5. delete the release branch.

Repository settings are intended to allow squash merge and auto-merge while still permitting direct main commits for emergencies or explicit maintenance.

This keeps `main` release-oriented: one commit per BallerWatch version.

Important architecture rules:

- do not commit runtime state back into GitHub
- Cloudflare KV is the runtime-state authority
- GitHub Actions may materialize state only temporarily
- Cloudflare Cron Triggers are the normal recurring scheduler
- cron-job.org is independent failover; its three jobs stay enabled, while pickup/league GitHub runs self-skip when Cloudflare heartbeats are fresh
- do not add GitHub `schedule:` polling
- keep AI bounded and read-only with respect to real-world actions
- keep live/private soccer data out of source control
- use a release branch by default and bump `features/versions.json` only after implementation tests pass

## Versioning

BallerWatch uses Semantic Versioning:

- **MAJOR** — intentional breaking architecture or behavior change
- **MINOR** — new backward-compatible capability
- **PATCH** — backward-compatible fix, reliability/privacy improvement, or internal change

Full release history is in `features/versions.json`.

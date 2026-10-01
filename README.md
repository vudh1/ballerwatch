# BallerWatch

BallerWatch is a privacy-first soccer automation system for **pickup games** and **Seattle RATS league games**.

It combines Telegram, Cloudflare Workers, GitHub Actions, cron-job.org, Groq, and Google Calendar into one lightweight system that watches soccer data, answers questions, sends alerts, keeps schedules synchronized, and can collect feature feedback for future improvements.

The project is designed to stay inexpensive to operate: the normal architecture uses free service tiers and avoids unnecessary polling or paid AI calls.

**Current version: 1.6.0**

## How BallerWatch works

BallerWatch has two types of activity:

1. **Instant user interaction** — Telegram messages arrive through a Cloudflare Worker webhook.
2. **Background monitoring** — cron-job.org periodically starts GitHub Actions that refresh pickup and league data and verify system health.

A typical Telegram request follows this path:

```text
Telegram
   ↓
Cloudflare Worker
   ├─ verifies the Telegram webhook
   ├─ verifies the owner chat
   ├─ immediately sends "typing..."
   └─ dispatches the exact Telegram update to GitHub
          ↓
GitHub Telegram listener
   ├─ handles known commands deterministically
   ├─ uses Groq only for unknown questions
   ├─ saves unsupported requests for feature review
   └─ sends the final Telegram reply
```

Background monitoring follows this path:

```text
cron-job.org
   ├─ every 2 min  → Pickup watcher
   ├─ every 5 min  → RATS league watcher
   └─ every 10 min → System watchdog
                         ↓
                    GitHub Actions
                         ↓
              encrypted repository state
```

## Main features

### Pickup monitoring

The pickup watcher checks the configured RSVP source every **2 minutes**.

It tracks information such as:

- available play dates
- reserved count and capacity
- player and waitlist state
- game time
- field information
- owner RSVP status
- notification state

BallerWatch can send Telegram alerts for important pickup changes while keeping private participant and location data encrypted at rest.

### RATS league monitoring

The league watcher checks Seattle RATS data every **5 minutes**.

It can:

- monitor multiple configured teams
- detect schedule changes
- detect score changes
- track kickoff time and field information
- track jersey information
- synchronize changed matches to Google Calendar
- notify Telegram when relevant changes occur

The monitored team list is stored encrypted and can be managed through Telegram.

### Instant Telegram control

Telegram is the main user interface.

Messages are received through a **Cloudflare Worker webhook**, so BallerWatch does not need to wait for a once-per-minute polling job before noticing a question.

The Worker immediately shows Telegram's **typing...** indicator. Common read-only questions are answered directly at the Cloudflare edge from encrypted GitHub state; only state-changing, unsupported, or fallback requests are dispatched to the GitHub listener.

Useful commands include:

- `what game is today?`
- `what league teams are you monitoring?`
- `add league team <name>`
- `remove league team <name>`
- `rename league team <old> to <new>`
- `what's the count for 10/8?`
- `snooze for 30 minutes`
- `unsnooze`
- `/setup`
- `/version`
- `/help`

### AI fallback

Known BallerWatch commands are handled by deterministic code first.

If the listener does not understand a question, it can optionally send the question and a limited read-only BallerWatch context to **Groq** using `openai/gpt-oss-20b`.

AI is used in two bounded layers:

- **Cloudflare intent routing** — up to 25 classifications per UTC day, with a 1.2-second timeout, used only when the fast deterministic parser cannot classify a read-only question.
- **GitHub fallback answering** — up to 25 calls per UTC day, with a 2.5-second timeout, used only after the request reaches the full listener.

AI cannot directly change RSVP, Calendar, settings, or repository state. Facts still come from deterministic BallerWatch state, and unsupported requests fall back to the feature-request queue.

BallerWatch is intentionally designed for **free-tier-only AI use**. There is no paid-AI mode in the repository.

### Feature feedback

If BallerWatch does not support something yet, the request can be saved for later improvement.

You can force a feature request with:

```text
/feature <request>
```

If a bot answer is wrong, reply directly to that bot message with:

```text
👎
```

BallerWatch privately records the original question and rejected answer so future maintenance can identify areas that need improvement.

### Google Calendar synchronization

RATS matches are synchronized through a Google Apps Script Calendar bridge.

The league watcher first compares the latest schedule against the previously applied Calendar snapshot. Google Calendar is contacted only when a future match materially changes or needs to be created.

This avoids unnecessary Calendar requests on every five-minute league check.

### System watchdog

The watchdog runs every **10 minutes**.

It verifies:

- pickup watcher freshness
- league watcher freshness
- Cloudflare Telegram webhook health
- validation status
- encrypted state readability
- absence of sensitive plaintext files

For recoverable watcher failures, it can dispatch the affected GitHub workflow again.

## Services and responsibilities

| Service / component | Responsibility |
| --- | --- |
| **Telegram Bot API** | User interface, notifications, and bot replies |
| **Cloudflare Worker** | Instant Telegram webhook receiver, `typing...`, encrypted-state read-only fast path, short conversation context, and AI intent routing |
| **GitHub repository** | Source code and encrypted persistent state |
| **GitHub Actions** | Runs listeners, watchers, validation, deployment, and recovery |
| **cron-job.org** | External scheduler for pickup, league, and watchdog workflows |
| **Groq** | Optional free AI fallback for unknown Telegram questions |
| **Seattle RATS** | League schedule and score source |
| **Pickup RSVP source** | Pickup-game RSVP source |
| **Google Apps Script** | Secure Calendar bridge |
| **Google Calendar** | Final synchronized league schedule |

## Main GitHub workflows

| Action | Purpose | Normal trigger |
| --- | --- | --- |
| **Telegram listener** | Handles state-changing, unsupported, or fallback Telegram requests that the Cloudflare fast path does not answer | Cloudflare webhook escalation |
| **Pickup watcher** | Refreshes pickup RSVP data and sends pickup notifications | Every 2 minutes |
| **RATS league watcher** | Refreshes league data and synchronizes changed Calendar matches | Every 5 minutes |
| **System watchdog** | Checks component, state, validation, and webhook health | Every 10 minutes |
| **Validate code** | Runs syntax, privacy, watchdog, and league tests | Relevant source/config changes |
| **Manual smoke test** | Runs an end-to-end notification-silent verification | Manual |
| **Purge current data** | Removes generated snapshots so they can rebuild cleanly | Manual |
| **Configure external cron** | Creates or updates cron-job.org schedules | Manual |
| **Deploy Telegram webhook** | Deploys the Cloudflare Worker and configures Telegram webhook delivery | Webhook code changes / manual |
| **Deploy Calendar bridge** | Deploys the Google Apps Script Calendar bridge | Calendar bridge changes / manual |
| **Configure repository** | Sets the repository description | Manual |

## Scheduling

BallerWatch is migrating recurring watcher checks from cron-job.org to **Cloudflare Cron Triggers**. The edge runtime is designed to poll pickup every 2 minutes, RATS every 5 minutes, and perform health coordination every 10 minutes. During migration, the existing cron-job.org schedules remain the production fallback until the Cloudflare KV-backed cutover passes its shadow refresh verification.

Current cadence:

| Component | Frequency |
| --- | ---: |
| Pickup watcher | Every 2 minutes |
| RATS league watcher | Every 5 minutes |
| System watchdog | Every 10 minutes |
| Telegram listener | Event-driven; only when Telegram sends a message |

The old one-minute Telegram polling cron is disabled after the Cloudflare webhook is deployed successfully.

## Privacy and encrypted state

This repository is public, so BallerWatch is designed around encrypted-at-rest state.

Private information must never intentionally be committed as readable tracked files.

Encrypted state includes data such as:

- Telegram listener settings
- pickup snapshots
- pickup notification state
- league schedule state
- Calendar synchronization state
- monitored league team configuration
- feature-request archive
- watchdog state

Pickup and league state uses AES-256-GCM encryption.

Plaintext private data may exist temporarily inside a GitHub Actions runner while a workflow is executing, but it must be removed before generated state is committed.

### Feature-request privacy

Unsupported Telegram questions, manual feature requests, and rejected-answer feedback are stored in encrypted `requests/private.json`.

The public `requests/unknown.json` file contains only privacy-safe aggregate information such as:

- broad request category
- count
- number of manual requests
- number of thumbs-down feedback items

It does **not** contain the original question, rejected answer, request ID, or timestamp.

### Encryption key

For new installations, use a dedicated cryptographically random `TRACKER_STATE_KEY` of at least 32 bytes.

Store it only as a GitHub Actions secret.

Existing installations may use `TELEGRAM_BOT_TOKEN` as the compatibility encryption-key source when `TRACKER_STATE_KEY` is absent. Do not change the encryption-key source casually: existing encrypted files must be migrated to the new key before the old key is removed.

## League team configuration

A fresh setup includes built-in default monitored teams. The actual defaults remain in code rather than this README.

After the first successful run, the encrypted team list becomes the saved configuration.

Teams can then be managed through Telegram:

- `what league teams are you monitoring?`
- `add league team <name>`
- `remove league team <name>`
- `rename league team <old> to <new>`

## Purge current data

Use:

**Actions → Purge current data → Run workflow**

Enter:

```text
PURGE
```

The purge removes generated state including:

- pickup snapshots
- pickup notification state
- league schedule state
- league Calendar reconciliation state
- watchdog state
- stored feature-request data

It does **not** remove:

- source code
- GitHub Actions secrets
- version history
- Telegram listener configuration
- encrypted league-team configuration
- Google Calendar events

Normal watchers rebuild fresh state afterward.

## Required secrets

### Core

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `OWNER_RSVP_NAME`
- `UPSTREAM_ENDPOINT`
- `TRACKER_STATE_KEY` — optional for existing installations

### Free AI fallback

- `GROQ_API_KEY` — API key from a dedicated Groq Free-tier organization

For zero-cost protection, keep the Groq organization on the Free tier and do **not** attach a payment method.

Without `GROQ_API_KEY`, unknown Telegram requests simply go to the encrypted feature-request queue.

### Cloudflare Telegram webhook

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The initial deployment may require Workers Admin permission. After the Worker exists, the token can be reduced to the permissions needed to update the existing Worker.

### cron-job.org

- `CRON_JOB_ORG_API_KEY`
- `CRON_GITHUB_PAT`

### Google Calendar bridge

- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`
- `CLASPRC_JSON`
- `APPS_SCRIPT_ID`
- `APPS_SCRIPT_DEPLOYMENT_ID`

### Optional repository setup

- `REPO_ADMIN_TOKEN`

Used only by the optional **Configure repository** workflow.

Never commit any secret value.

## Initial setup

1. Add the required GitHub Actions secrets.
2. Optionally add a Groq Free-tier API key as `GROQ_API_KEY`.
3. Register a Cloudflare Workers `workers.dev` subdomain.
4. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
5. Run **Deploy Telegram webhook**.
6. Run **Configure external cron**.
7. Run **Deploy Calendar bridge**.
8. Optionally run **Configure repository**.
9. Run **Manual smoke test**.
10. Confirm Telegram, pickup, league, Calendar, and watchdog behavior during normal operation.

For pickup endpoint recovery, follow `skills/find-upstream-endpoint/SKILL.md`.

Never put the live upstream endpoint in source code.

## Validation

The **Validate code** workflow checks:

- JavaScript syntax
- release/version history
- encrypted-at-rest privacy rules
- feature-request privacy behavior
- watchdog tests
- league tests

Generated state-only commits are intentionally excluded so normal watcher activity does not waste Actions runs.

## Repository maintenance

Before making repository changes, read:

- `AGENTS.md`
- `README.md`
- `features/versions.json`

Important rules:

- keep secrets and private/live soccer data out of readable tracked files
- keep Telegram webhook delivery as the primary message-ingress path
- do not recreate the old recurring Telegram polling cron
- do not add GitHub `schedule:` cron jobs
- use cron-job.org for recurring watchers
- keep AI read-only and optional
- validate source/config changes
- update `features/versions.json` when the product behavior changes
- do not bump the version when nothing changed

## Versioning

BallerWatch uses Semantic Versioning:

- **MAJOR** — intentional breaking change
- **MINOR** — new backward-compatible feature
- **PATCH** — backward-compatible fix, reliability improvement, privacy improvement, or internal change

The full release history is in `features/versions.json`.

## Fast response path

For common read-only Telegram questions, BallerWatch avoids starting a GitHub Actions runner.

The Cloudflare Worker fetches the already-encrypted BallerWatch state from GitHub, decrypts it only inside the authenticated Worker, caches the snapshot briefly, and sends the answer directly to Telegram.

Examples that can use the fast path include:

- `what game is today?`
- `what's my next game?`
- `what's the count for Thursday?`
- `what field?`
- `what time?`
- `what league teams are you monitoring?`
- `/version`
- `/help`

Short-lived conversation context lets follow-up questions refer to the most recently discussed pickup date.

Commands that modify state, such as snooze/mute changes, league-team changes, setup changes, manual feature requests, or thumbs-down feedback, continue to use the GitHub listener.

This split keeps fast questions fast while preserving the existing encrypted persistence and deterministic write behavior.


## Cloudflare primary-runtime migration

Version 1.6.0 introduces the 2.0 architecture preview.

After successful activation, Cloudflare becomes the normal scheduler and hot-state runtime:

```text
Telegram ───────────────→ Cloudflare Worker
                               │
                               ├─ structured intent / AI routing
                               ├─ short conversation context
                               ├─ current soccer snapshots in private KV
                               ├─ pickup check every 2 minutes
                               ├─ RATS check every 5 minutes
                               └─ health coordination every 10 minutes
                                      │
                                      └─ GitHub Action only when source data changed
```

The existing GitHub pickup and league workflows remain responsible for mature notification, encrypted-repository persistence, and Calendar reconciliation. The difference is that they no longer need to start on every polling interval once edge cutover is active.

Deployment performs a notification-silent shadow refresh against both live sources before disabling the legacy cron-job.org jobs.

Cloudflare KV setup can be completed in either of two ways:

- grant the deployment token permission to create/list Workers KV namespaces; or
- manually create a private KV namespace and store its namespace ID as the optional GitHub secret `CLOUDFLARE_KV_NAMESPACE_ID`.

If KV provisioning or shadow verification fails, the deployment stops before disabling the old schedules.

# BallerWatch

BallerWatch is a small soccer automation system for pickup games and Seattle RATS league games.

It uses Telegram and an installable GitHub Pages web app for questions and alerts, Cloudflare Workers for the webhook/read-only API path, cron-job.org for scheduling, GitHub Actions for watcher/reconciliation work, Gemini Flash with Groq fallback for bounded AI assistance, standards-based Web Push for a Telegram-independent notification channel, and Google Calendar for league match sync.

**Current version: 5.4.2**

## Recent changes

- **5.4.x — Review fidelity + answer reliability.** Exact owner Q&A stays encrypted for 48 hours while readable review signals remain sanitized; weekday time/location questions are deterministic, and match-card/notification layouts are tighter.
- **5.3.x — Connected match carousel.** Swipe between game dates with equal-size connected cards, stronger match-window weather verification, and duplicate pickup/notification suppression.
- **5.2.x — Notification inbox + sharing.** Added unread/full-screen notification handling, swipe-to-delete, local Delete all, compact push controls, and generic native game sharing.
- **5.1.x — Liquid Glass + live refresh.** Introduced the polished mobile dashboard, calendar selection, pickup capacity, weather fallbacks, automatic data/app refresh, and reliable first launch after releases.
- **5.0.x — 14-day match dashboard.** Added the two-week game calendar, match-window weather, next-game spotlight, and a leaner monitoring schedule.

Full release history and Telegram announcement text live in `features/versions.json`.

## Web app demo

**Live demo:** [Open BallerWatch](https://vudh1.github.io/ballerwatch/)

Try the public-safe web app:

1. Swipe the main match card left/right to move between upcoming game dates.
2. Tap a highlighted date in the 14-day calendar to inspect that match.
3. Open the notification bell to view recent updates and the full-screen notification reader.
4. Ask a read-only question such as `What time is Thursday?` or use a slash command like `/next`.
5. On iPhone, add the site to the Home Screen to try the standalone PWA experience and Web Push controls.

The public demo is read-only. Owner-only settings and wrong-answer feedback require pairing from **Settings**.

## Architecture

```text
Telegram -------------------+
                            |
GitHub Pages PWA -----------+--> Cloudflare Worker
                                 |-- public-safe Q&A / board
                                 |-- owner-paired settings
                                 |-- encrypted push registration
                                 '-- Telegram webhook
                                           |
                                           v
                                  GitHub runtime-state

cron-job.org
   |-- every 2 min --> Pickup watcher
   '-- every 5 min --> RATS league watcher

GitHub schedule
   '-- every 6 hr --> Watchdog + match weather
                        |
                        v
                   GitHub Actions
                         |
                         +--> encrypted runtime-state
                         +--> Telegram alerts
                         +--> Web Push signals
                         '--> Google Calendar when needed
```

Cloudflare has **no Workers KV binding** and **no Cloudflare Cron Triggers** in the production configuration.

## User interfaces

### Telegram

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


### iPhone / web app

The v3 PWA is published at:

`https://vudh1.github.io/ballerwatch/`

It provides:

- an installable Home Screen app shell with a translucent Liquid Glass-inspired dashboard;
- a redesigned match dashboard with a next-game spotlight, Google Maps directions, and native device sharing;
- a compact 14-day game calendar for pickup and monitored RATS teams, synchronized with left/right swipe navigation on the match spotlight;
- match-window weather showing condition, temperature, and the maximum rain probability during the scheduled game window;
- a compact notification inbox behind the top-right bell with unread counts, full-screen reading, animated per-device swipe-to-delete, and local Delete all;
- one-question/one-answer Q&A with slash commands and Google-style full-sentence autocomplete; paired-owner questions retain the original question and answer only inside encrypted 48-hour review history while anonymous web questions are not retained;
- owner-paired double-tap/double-click feedback on an answer to mark it wrong for the next engineering review; repeat the gesture to cancel that feedback;
- a compact Web Push On/Off control beside notification Refresh for pickup, real RATS schedule-change, and version notifications;
- a manual local notification test for confirming iPhone notification display while the app is closed.
- a Telegram footer shortcut beside GitHub and Wiki.

On iPhone, open the site in Safari, choose **Share → Add to Home Screen**, open the installed BallerWatch app, then use the notification bell to turn Push notifications on.

The anonymous public web surface remains read-only and deliberately strips RSVP participant names, waitlist names, owner-specific status, secrets, and private settings. An owner-paired device can view/change only the pickup RSVP name and monitored league teams through the Settings gear.

## 48-hour owner review history

BallerWatch no longer automatically turns every unanswered question into a feature request.

Instead:

1. an owner exchange from the private bot or an owner-paired PWA retains the original question and original bot answer inside private review history;
2. Groq may add privacy-cleaned classification, summary, and reason metadata for engineering triage, but that generated metadata never replaces the source exchange;
3. `state/chat-history.json` is AES-GCM encrypted on the `runtime-state` branch and pruned after at most **48 hours**;
4. only actionable, sanitized signals are copied to the readable `state/chat-review.json`.

The readable review file can contain only:

- `bug_candidate`
- `feature_candidate`
- `negative_feedback`
- timestamp
- short technical summary
- short reason

It must not contain raw Telegram text, names, IDs, tokens, URLs, exact addresses, or quoted messages.

This lets scheduled ChatGPT maintenance inspect privacy-minimized engineering signals without exposing or decrypting the original question/answer text; the exact source exchange remains inside the encrypted 48-hour history.

Explicit `/feature <request>` is still supported when you intentionally want to submit a feature request.

Replying **👎** to a bot answer records that exchange as negative feedback for review rather than automatically creating a feature request.

## Pickup watcher

cron-job.org dispatches the pickup GitHub Action every **2 minutes**.

The workflow:

1. loads encrypted runtime state from `runtime-state`;
2. reads the current RSVP source;
3. compares with prior state;
4. records a public-safe web-board entry and attempts Telegram delivery only when the production rules require a notification;
5. signals subscribed web apps through Web Push without depending on Telegram delivery;
6. writes only changed encrypted state back to `runtime-state`;
7. removes local runtime files.

The GitHub workflow remains responsible for the mature notification rules.

## RATS league watcher

cron-job.org dispatches the RATS league workflow every **5 minutes**.

The workflow:

1. restores monitored teams and last-known league state;
2. checks the most likely current season first;
3. retrieves independent team schedules concurrently with bounded retries for transient source failures;
4. retains a previously validated last-good schedule when RATS is temporarily unavailable;
5. compares schedules and scores;
6. records the public-safe web fallback and attempts Telegram delivery for real schedule changes;
7. signals subscribed web apps through Web Push when a new allowed notification exists;
8. updates Google Calendar only when the applied Calendar snapshot differs;
9. persists changed encrypted state.

This avoids unnecessary Calendar calls when nothing changed.

### Match weather

Weather is refreshed every six hours from Open-Meteo for the actual scheduled match window. BallerWatch reports the maximum hourly rain probability that overlaps the game, plus temperature and a compact condition label. Venue coordinates are cached so recurring fields are not repeatedly geocoded; new public venue names/addresses are resolved conservatively through OpenStreetMap Nominatim.

Weather data and cached coordinates live in encrypted `state/weather.json` on `runtime-state`. No weather API key is required.

## Watchdog and match weather

The watchdog runs on a native GitHub Actions schedule every **6 hours**. The same maintenance run refreshes the encrypted 14-day match-weather cache.

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
- encrypted Web Push VAPID keys/subscriptions and notification-board state
- watchdog state
- explicit private feature-request archive
- encrypted 48-hour owner conversation history, including original question/answer text

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
| System watchdog + match weather | Every 6 hours | GitHub Actions native schedule |
| Telegram webhook | Event-driven | Cloudflare Worker |
| Fast Telegram read-only reply | Event-driven | Cloudflare Worker |
| PWA public-safe Q&A / board | Event-driven | GitHub Pages → Cloudflare Worker |
| PWA owner settings | User-driven, paired device only | GitHub Pages → Worker → GitHub listener |
| Web Push registration | User-driven | PWA → Worker → GitHub Action |
| Web Push delivery | Only for allowed new notifications | GitHub Action → browser push service |
| State-changing Telegram command | Event-driven | GitHub listener |
| Calendar sync | Only when league snapshot requires it | GitHub Action |

Cloudflare Cron Triggers remain disabled. The only native GitHub `schedule:` is the six-hour watchdog/weather maintenance run.

## Cloudflare outage behavior

Cloudflare is the Telegram webhook and PWA read-only API endpoint, so a total Cloudflare outage temporarily prevents new inbound Telegram commands, fast replies, live PWA Q&A, and notification-board refreshes.

Core monitoring and subscribed-device signaling continue independently:

- cron-job.org still dispatches pickup/league;
- GitHub's six-hour maintenance schedule can still refresh watchdog/weather state;
- GitHub Actions can still retrieve soccer sources;
- GitHub can still attempt Telegram delivery;
- GitHub Actions can send Web Push signals directly to registered browser push endpoints;
- if the PWA cannot fetch the latest board entry during a push, its service worker shows a generic BallerWatch update;
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
- original owner question/answer text is retained only inside encrypted 48-hour chat history and never exposed in the readable review index;
- Web Push subscriptions and VAPID private material stay encrypted on `runtime-state`;
- web-visible board/Q&A data excludes roster names, waitlist names, and owner-specific status;
- chat review output is sanitized before it becomes readable;
- `privacy-audit.mjs` prevents runtime paths from being tracked on `main`.

The state encryption key comes from `TRACKER_STATE_KEY`. Existing compatibility fallback to `TELEGRAM_BOT_TOKEN` remains supported.

## AI usage

BallerWatch keeps AI bounded and optional. Deterministic intent matching and action handling remain authoritative.

For safe natural-language answering, Gemini Flash is tried first when deterministic handling does not resolve the request. If Gemini is unavailable, rate-limited, or cannot answer, BallerWatch falls back to Groq and then deterministic/non-AI handling where appropriate. The PWA reuses this bounded read-only classification path after private roster/owner data is stripped. Groq remains responsible for privacy-minimized review classification/summary metadata. Models receive no action tools.

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
- encrypted Web Push subscriptions/VAPID state and notification boards
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
| **Deploy Telegram webhook** | Deploy the Telegram + PWA read-only Cloudflare Worker |
| **Deploy Calendar bridge** | Deploy and verify the Apps Script Calendar bridge |
| **Validate code** | Style, syntax, tests, privacy audit |
| **Manual smoke test** | Notification-silent live-source verification |
| **Purge current data** | Factory-reset generated runtime state |
| **Configure external cron** | Create/repair the 2/5-minute cron-job.org schedules and disable retired listener/watchdog jobs |
| **Web app runtime** | Initialize/update encrypted Web Push subscription state |
| **Deploy GitHub Pages app** | Publish the installable PWA from `docs/` |
| **Publish wiki** | Mirror `docs/wiki/` into the GitHub Wiki |
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

### Web Push

No new repository secret is required. The Web app runtime workflow generates the VAPID key pair when needed and stores both the private VAPID material and device subscriptions inside AES-GCM-encrypted `runtime-state`.

### Wiki publishing

The GitHub Wiki is mirrored automatically from `docs/wiki/` using the workflow-scoped `GITHUB_TOKEN`; no extra Wiki token is required.

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

- fast for normal Telegram and PWA read-only questions;
- inexpensive to operate;
- resilient when one infrastructure provider or Telegram is unavailable;
- conservative about private data;
- simple enough to maintain and onboard;
- release-oriented on `main`;
- able to learn from short-lived feedback while keeping original owner Q&A encrypted and readable review artifacts privacy-minimized.

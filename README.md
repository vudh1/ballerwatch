# BallerWatch

BallerWatch is a small soccer operations app for pickup games and Seattle RATS league matches. The installable web app is the primary user surface; Telegram is an optional messaging/recovery adapter.

**Current source version: 5.8.0**

**Production source of truth:** the commit pointed to by `production` and the corresponding published GitHub Release. `main` may be newer without changing the live app.

## What you can do

- See the next pickup or league match, RSVP capacity, field, and match-window weather.
- Browse a 14-day game calendar.
- Swipe between match cards on touch devices or use the desktop card-edge controls.
- Ask read-only questions such as `What time is Thursday?` or `/next`.
- Receive Web Push notifications for the narrow production notification allowlist.
- Sign in to **User settings** to change the pickup RSVP display name and monitored league teams.
- Mark a bad answer with **Wrong answer** without signing in or opening Settings.
- Keep using the PWA if the optional Telegram adapter is disabled.

## Recent changes

- **5.8.x — User-first settings + runtime encryption hardening.** Settings uses user-facing language, every `runtime-state` file is a complete AES-GCM envelope, desktop carousel edges are softer and easier to hit, and installed iPhone content gets a blurred status-area separation layer.
- **5.7.x — Release-gated rollout + standalone sign-in.** Added app-native password sign-in, desktop click navigation, and a separate `production` branch so merging to `main` no longer means immediate deployment.
- **5.6.x — Frictionless feedback + multi-device recovery.** Wrong-answer feedback became answer-scoped and one-tap; pairing codes became reusable across multiple devices for their 10-minute lifetime.
- **5.5.x — iPhone-first dashboard.** Reworked the app around the glass dashboard, larger match spotlight, RSVP progress, calendar selection, Ask panel, and notification popover.
- **5.4.x — Review fidelity + deterministic schedule answers.** Improved weekday time/location answers and short-lived engineering-review fidelity while keeping retained source exchanges encrypted.

Full release history lives in `features/versions.json`.

## Try the web app

**Live app:** https://vudh1.github.io/ballerwatch/

A useful first pass:

1. Open the next-game card.
2. On iPhone, swipe left/right. On desktop, move the pointer near an available card edge; the edge softly lights up and can be clicked.
3. Tap a highlighted date in the 14-day calendar.
4. Open the notification bell.
5. Ask `What time is Thursday?` or `/next`.
6. Open **Settings**. A configured device can sign in with the user password; `/webpair` is a bootstrap/recovery path rather than the normal flow.
7. On iPhone, use Safari → Share → **Add to Home Screen** for standalone mode and Web Push.

Anonymous use stays read-only.

## Architecture at a glance

```text
                         +----------------------+
GitHub Pages PWA ------->| Cloudflare Worker    |
                         | public-safe API       |
Telegram (optional) ---->| + webhook adapter    |
                         +----------+-----------+
                                    |
                                    v
                         encrypted runtime-state
                                    ^
                                    |
           +------------------------+------------------------+
           |                        |                        |
     Pickup watcher           RATS watcher             Listener / web
     every 2 min              every 5 min             state changes
     cron-job.org             cron-job.org            event driven

GitHub native schedule
  every 6 hr ---> watchdog + 14-day weather

RATS changes ---> Google Calendar bridge
Allowed alerts -> Telegram (optional) + Web Push
```

The important boundaries are:

| Boundary | Responsibility |
| --- | --- |
| `main` | Reviewed integration code. May be ahead of production. |
| `production` | Exact commit currently approved for production execution/deployment. |
| `runtime-state` | Generated runtime data only. Every canonical file must be a complete AES-GCM envelope. |
| Cloudflare Worker | Fast read-only PWA/Q&A path, user authentication, push registration, optional Telegram webhook. |
| GitHub Actions | Reconciliation, notifications, Calendar work, release promotion, validation, and recovery. |
| cron-job.org | High-frequency pickup (2 min) and league (5 min) dispatch only. |

Cloudflare Workers KV and Cloudflare Cron Triggers are intentionally not part of production.

## User settings and recovery

Settings is private but intentionally narrow. An authenticated device can change only:

- the pickup RSVP display name;
- monitored RATS teams.

After initial setup, the normal flow is **User password → Sign in**. Each device receives its own signed local capability token.

`/webpair` remains a bootstrap/recovery mechanism while Telegram is configured:

1. request `/webpair`;
2. enter the six-digit code in **Settings → Use a pairing code instead**;
3. the same code can authorize multiple devices until its 10-minute expiry;
4. set or rotate the user password so future devices can sign in directly.

Existing pre-5.8 device tokens and legacy API aliases remain accepted during migration, but current app copy and current API calls use **user** terminology.

## Privacy and runtime storage

The public repository must never become a data store.

### Everything on `runtime-state` is encrypted

In 5.8, **every canonical runtime file is stored as one authenticated AES-256-GCM envelope**, including data that is already privacy-minimized:

- listener/user settings and update cursor;
- pickup and league snapshots;
- monitored teams;
- Calendar reconciliation state;
- weather/geocode cache;
- watchdog state;
- Web Push VAPID private material and subscriptions;
- notification-board state;
- exact retained Q&A;
- sanitized chat-review signals;
- private feature requests;
- the aggregate feature-request projection.

`shared/runtime-state.mjs` enforces this boundary. It:

- migrates legacy partial/readable runtime formats during deployment;
- refuses to persist a canonical file that is not an encrypted envelope;
- audits the whole runtime branch during Worker deployment and the six-hour watchdog run;
- keeps `runtime-state` as a one-snapshot parentless branch rather than an accumulating readable history.

A public endpoint may return a deliberately allowlisted projection, but the Worker decrypts that projection only at the API boundary. The stored branch copy remains encrypted.

### Short-lived answer review

Exact question/answer text is retained for at most 48 hours only when:

- the exchange came from an authenticated user surface; or
- an anonymous visitor explicitly marks that answer **Wrong answer**.

The engineering-review projection contains only sanitized signals such as category, short summary, reason, and timestamp—and is encrypted at rest too.

Anonymous public-web questions are not retained by default.

### Temporary plaintext

GitHub runners or one Worker invocation may temporarily hold decrypted data in memory/local ephemeral files while doing authorized work. Workflows clean transient runtime paths after use. Tests use synthetic/encrypted fixtures and must never upload decrypted runtime artifacts.

## Notifications

Production proactive notifications are intentionally narrow:

- pickup RSVP/capacity changes;
- real RATS schedule changes;
- one combined version-change announcement per Pacific day.

Direct replies to authenticated Telegram input are allowed when that adapter is enabled.

Tests, smoke runs, builds, deploys, watchdog health events, commits, PRs, score-only changes, and setup reminders must not generate Telegram or Web Push notifications.

## Scheduling

| Work | Cadence | Executor |
| --- | --- | --- |
| Pickup watcher | every 2 minutes | cron-job.org → GitHub Actions |
| RATS watcher | every 5 minutes | cron-job.org → GitHub Actions |
| Watchdog + match weather | every 6 hours | GitHub Actions schedule |
| Release eligibility check | hourly | GitHub Actions; promotes only after the 24-hour soak |
| PWA / Telegram webhook | event-driven | Cloudflare Worker |
| User settings / feedback | user-driven | PWA → Worker → encrypted runtime flow |
| Calendar sync | only when schedule reconciliation requires it | GitHub Actions → Apps Script |

## Release model

A merge to `main` is **not** a deployment.

For a product release:

1. create `release/<version>` from current `main`;
2. implement first;
3. get **Validate code** green;
4. for runtime-affecting work, run the notification-silent **Manual smoke test**;
5. update the version ledger/docs only after implementation is green;
6. mark the PR ready and squash merge;
7. leave the candidate on `main` for the default 24-hour soak;
8. the hourly **Promote production release** check validates the candidate, advances `production`, publishes the GitHub Release/tag, and release-triggered deploy workflows use that exact version.

A manual promotion skips the soak but not validation.

Maintenance work—docs, comments, behavior-preserving refactors, test-only changes, formatting, or CI/tooling cleanup—does **not** consume a product version and does not create another release.

### GitHub Release credential

Use a fine-grained repository secret named `RELEASE_GITHUB_TOKEN` with **Contents: read/write** and **Workflows: read/write**. The workflow permission is required when the tagged product commit changes files under `.github/workflows/`. `CRON_GITHUB_PAT` remains separate for scheduler dispatches.

Promotion fails closed if the available credential cannot publish the GitHub Release; it should not silently move production without the release record.

## Workflow responsibilities

The workflow set is intentionally split by failure domain rather than by file count:

| Workflow | Responsibility |
| --- | --- |
| **Validate code** | style, syntax, unit tests, Worker bundle, version ledger, privacy audit |
| **Manual smoke test** | notification-silent live-source validation |
| **Promote production release** | 24-hour/manual promotion gate and GitHub Release publication |
| **Deploy GitHub Pages app** | static PWA deployment |
| **Deploy BallerWatch Worker** | Worker deploy, runtime-state migration/audit, optional Telegram setup, normal external-scheduler sync |
| **Deploy Calendar bridge** | Apps Script Calendar bridge |
| **Web app runtime** | VAPID/push-registration runtime initialization |
| **Refresh match weather** | notification-silent release/bootstrap weather refresh |
| **Pickup watcher** | pickup refresh + allowed pickup notifications |
| **RATS league watcher** | league refresh + Calendar reconciliation + allowed schedule notifications |
| **Telegram listener** | event-driven Telegram/state-changing fallback path |
| **System watchdog** | six-hour health checks, weather, runtime encryption audit |
| **Repair external cron schedules** | manual recovery only; normal deployment already maintains scheduler posture |
| **Purge current data** | factory-reset generated BallerWatch state |
| **Publish wiki** | mirror `docs/wiki/` to the GitHub Wiki |
| **Cleanup merged release branches** | delete closed stale `release/*` / `fix/*` branches |

The 5.8 audit deliberately removed the release trigger from external-cron repair because Worker deployment already performs that normal synchronization. Other deploy/runtime workflows remain separate because they use different credentials, failure domains, and rollback surfaces.

## Repository layout

```text
docs/                    PWA + maintained wiki source
infra/                   Cloudflare and scheduler integration
listener/                event-driven command/state-changing listener
pickup/                  pickup source + notification logic
league/                  RATS source + Calendar reconciliation
weather/                 match-window forecast pipeline
shared/                  encryption, runtime-state, push, AI, common logic
features/                product version ledger
tests/                   test-only source mirroring production areas
.github/workflows/       validation, runtime, release, recovery workflows
```

When a runtime module starts mixing domains, extract pure parsing/formatting/state-boundary logic into `shared/` and test it there. Keep provider-specific adapters at the edges.

## Developer quick start

Read these first:

1. `AGENTS.md`
2. `STYLE_GUIDE.md`
3. `features/versions.json`
4. the relevant page under `docs/wiki/`

Runtime code uses dependency-free Node.js 22 / ECMAScript modules. Test-only source belongs under `tests/`.

Useful local checks:

```bash
node --test
node infra/validate-versions.mjs
node privacy-audit.mjs
```

For runtime-state work, also validate the encryption invariant against an authenticated repository checkout:

```bash
node shared/runtime-state.mjs audit
```

Never send Telegram/Web Push or mutate Calendar from tests.

## Required configuration

### Core PWA / encrypted runtime

- `TRACKER_STATE_KEY` — preferred independent state key.
- `OWNER_RSVP_NAME` — legacy-compatible secret name for the default user RSVP display name.
- `UPSTREAM_ENDPOINT` — pickup data source.

The state crypto code can still fall back to `TELEGRAM_BOT_TOKEN` for migration compatibility, but a dedicated `TRACKER_STATE_KEY` is the scalable target.

### GitHub and scheduling

- `CRON_GITHUB_PAT`
- `CRON_JOB_ORG_API_KEY`
- `RELEASE_GITHUB_TOKEN` — preferred for GitHub Release publication.

### Cloudflare

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

### Optional Telegram adapter

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Normal PWA Settings/Q&A/Web Push should not depend on these once user-password bootstrap is complete.

### AI

- `GEMINI_API_KEY` — primary bounded read-only answer fallback.
- `GROQ_API_KEY` — secondary answer fallback and privacy-minimized review classification.

### Google Calendar bridge

- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_WEBHOOK_SECRET`

Web Push VAPID material is generated by BallerWatch and stored encrypted on `runtime-state`; no repository VAPID secret is required.

## Operations

### Factory reset

Run **Actions → Purge current data**, enter `PURGE`, and confirm. The workflow removes BallerWatch-managed Calendar events first, then generated runtime-state. It does not delete source code, repository/Worker secrets, or unrelated Calendar events.

### Failure behavior

- Cloudflare down: PWA live API and Telegram webhook are unavailable, but pickup/league GitHub workflows and native watchdog/weather still run.
- Telegram down/disabled: the PWA, user-password Settings, Web Push, monitoring, and Calendar reconciliation remain usable.
- Runtime branch temporarily unreadable: workflows may use the encrypted Actions-cache failover snapshot.
- RATS temporarily unavailable: league logic keeps the validated last-good schedule rather than replacing it with an empty transient result.
- GitHub Release credential invalid: promotion fails closed; `production` stays pinned.

## Scale-up principles

BallerWatch is intentionally small, but the boundaries are meant to scale:

- **Keep product state provider-neutral.** Telegram, Web Push, Cloudflare, and Google Calendar are adapters—not the domain model.
- **Keep reads fast and writes narrow.** Common questions are deterministic/edge-served; state changes go through explicit authenticated paths.
- **Encrypt before storage.** A future storage backend can replace GitHub without changing the state envelope contract.
- **Pin production.** Integration work can continue on `main` without changing live behavior.
- **Separate failure domains.** Pages, Worker, Calendar, schedulers, and monitoring can fail/recover independently.
- **Prefer idempotent reconciliation.** Watchers compare desired/current state instead of blindly rewriting external systems.
- **Keep tests notification-silent.** Verification must be safe to run repeatedly.

## More documentation

The maintained wiki source is under `docs/wiki/`:

- `Architecture.md`
- `Data-and-Privacy.md`
- `Development.md`
- `Operations.md`
- `Release-Process.md`
- `Runtime-and-Failover.md`
- `Web-App.md`

Those pages hold the deeper operational details so this README can stay useful for both users and new contributors.

# BallerWatch

BallerWatch is a privacy-first soccer PWA for pickup games and Seattle RATS league matches. It brings schedules, RSVP capacity, weather, reminders, league updates, Calendar sync, and quick answers into one installable app.

**Current source version: 8.10.2**

[Open original BallerWatch](https://vudh1.github.io/ballerwatch/) · [Open V2](https://vudh1.github.io/ballerwatch/v2/) · [Version guide →](https://github.com/vudh1/ballerwatch/wiki/Versions) · [GitHub Releases](https://github.com/vudh1/ballerwatch/releases)

> `main` is reviewed source. `production` is the exact released commit. The live app changes only after a validated promotion.

## What you can do

- **Try V2 at [/v2/](https://vudh1.github.io/ballerwatch/v2/):** a new Matchday / Schedule / Club layout, a reversible scroll-controlled soccer intro, and a separate iPhone Home Screen install. V1 stays at the root. Both use the same backend, account, matches, Inbox and canonical encrypted runtime-state. See the [V2 implementation and operations guide](docs/wiki/V2.md).

- See the next **Pickup** or **League** match with a cleaner visual hierarchy for location, weather, RSVP, and secondary actions. Newly published RSVP dates remain in the match-card carousel and expanded calendar even beyond the initial 14-day grid; missing field details show *Venue to be announced* until the RSVP source publishes a location.
- See RSVP capacity for pickup games; tap the capacity area to open the full-width roster sheet and RSVP from inside it.
- **Share just the field:** the Share button sends the RATS-published Google Maps venue link (or a verified GPS/field-name lookup fallback) with no team names, match date, or kickoff summary; clipboard fallback copies the same link.
- Browse a rolling match calendar and swipe between match cards; on desktop, the waterfall stays visually full-height while the Pickup/League Edit/Delete trigger keeps pointer priority over the carousel hit area.
- **Follow RATS Standings as a card train:** swipe between individual full-width team cards or use subtle edge arrows. Each current-season division table highlights your team, and tapping another team opens its indexed scored match history. The compact table shows played, W-D-L, goal difference and points. Results-based rankings are provisional.
- Use a real **Inbox** with Pickup / League / App filters, mark-all-read, swipe delete, and account-synced read state.
- Choose account-level notification categories and keep the unread count synchronized to the installed app badge on supported devices.
- Get allowed Web Push reminders and real schedule-change notifications.
- **Dynamic pickup capacity alerts:** RSVP bookings trigger at **25%, 50%, and 75%** of each published match's capacity, then each additional occupied spot through full. Thresholds round up to whole reservations (e.g., 16 slots alerts at 4, 8, 12, 13, 14, 15, and 16). A new match starts with a silent baseline, so past thresholds are not replayed; cancellations or settings-only capacity changes do not trigger booking alerts. The 24-hour RSVP and one-hour kickoff reminders remain separate, and muting/snoozing is honored.
- Open **Inbox** and **Settings** from the top-right notification bell and gear.
- Ask **BallerWatch AI** about opponents, match fields, jersey colors, weekly briefings, next games, and indexed RATS results—with follow-ups for a specific fixture.
- Sign in with separate user accounts and revocable sessions.
- For administrators: manage users, monitored RATS teams, reversible match overrides/deletes, and app promotion.
- Keep real RATS schedule changes synchronized to Google Calendar.

Saturday synthetic pickup is shown simply as **Pickup** and has no RSVP/capacity watcher.

## Demo

![BallerWatch animated demo: upcoming games, pickup RSVP capacity, quick answers, and Inbox notifications](docs/demo.gif)

A 22-second walkthrough with a short animated intro. Recorded from the app using synthetic sample data; game details, answers, and notifications are illustrative.

[Open BallerWatch](https://vudh1.github.io/ballerwatch/)

## What's new

**v8.10.2** — Protects V2’s navigation and header from the iPhone notch in landscape, with asymmetric safe-area browser regressions.

**v8.10.0** — A separate V2 experience with a native-scroll soccer cinematic, redesigned mobile navigation, the existing live data and capabilities, and independent PWA launch/cache identities. V1 remains at its original URL.

**v8.9.1** — Fixed a selector mismatch that gave standings an opaque blue hover strip. Match and standings now share the exact same translucent waterfall, responsive opacity, blur and masked fade.

That's the recent summary. Older release details live in [GitHub Releases](https://github.com/vudh1/ballerwatch/releases) and the [Versions guide](https://github.com/vudh1/ballerwatch/wiki/Versions). The project keeps the full ledger in [features/versions.json](features/versions.json) rather than repeating it in this README.

See the [Card design system](docs/CARD-DESIGN-SYSTEM.md) for the shared typography, waterfall, mobile gesture and bottom-footer rules.

## App updates

Administrators can open **Settings → App** and promote a validated source version.

Promotion is intentionally staged:

1. the release is validated and `production` advances;
2. the Cloudflare Worker deploys and passes live readiness/security checks;
3. GitHub Pages deploys the matching PWA from `production`;
4. the already-open PWA detects that both Worker and Pages reached the target version, updates its service worker, and **refreshes itself automatically**.

You should not need to close and reopen the installed app after a normal promotion.

For the difference between source, production, tags, and releases, see the **[Versions guide](https://github.com/vudh1/ballerwatch/wiki/Versions)**.

## How it is built

```text
GitHub Pages PWA
       |
       v
Cloudflare Worker
  |        |
  |        +--> encrypted runtime-state
  +-----------> auth / synced Inbox / Q&A / push registration / API

cron-job.org
  |--> Pickup watcher every 2 min
  +--> RATS watcher every 5 min

GitHub Actions
  |--> reconciliation + Web Push
  |--> watchdog/weather every 6 hr
  |--> release promotion/deployment
  +--> Google Calendar reconciliation
```

Workers KV and Cloudflare Cron Triggers are intentionally not part of production.

## Repository map

The repository now separates browser code from backend code explicitly:

```text
frontend/
  web/                    GitHub Pages PWA: HTML, CSS, app shell, manifest, service worker
    lib/                  session/API transport + notification-state modules

backend/
  infra/                  Cloudflare Worker + scheduler/infrastructure helpers
  pickup/                 pickup ingestion and notification logic
  league/                 RATS watcher + Google Calendar integration
  shared/                 encryption, runtime state, auth, push, common domain logic
  watchdog/               health/release monitoring
  weather/                match-window weather pipeline

tests/
  frontend/               PWA/browser regression tests
  backend/                backend tests mirrored by domain

docs/
  demo.gif                animated README walkthrough
  wiki/                   maintained project documentation

features/versions.json    product version ledger
scripts/                  repository checks/tooling
.github/workflows/        validation, runtime, release, recovery, deployment
```

The encrypted `runtime-state` branch intentionally keeps stable storage paths such as `pickup/state/`, `league/state/`, and `state/`. Those are storage contracts and do **not** mirror the source directory layout.

## Accounts and recovery

BallerWatch supports up to 20 encrypted web accounts. Each account has its own username, password, RSVP display name, authentication revision, revocable sessions, and bounded notification profile for cross-device read/delete state and category preferences.

Administrators can manage users and shared league configuration. Regular users can manage their own RSVP name/password.

Forgotten-password recovery is repository-admin controlled:

1. set temporary Actions secret `BALLERWATCH_RECOVERY_PASSWORD`;
2. run **Actions → Reset web user password**;
3. choose the username and type `RESET`;
4. sign in with the replacement password;
5. delete or rotate the temporary recovery secret.

The recovery workflow never intentionally prints or persists the plaintext password.

## Privacy and security

The public source repository is never used as readable application-data storage.

Canonical runtime documents are stored as complete hardened AES-GCM envelopes on the dedicated `runtime-state` branch, including user settings, schedules, weather/geocode cache, Web Push state, notification-board state, and retained feedback/feature-request state.

Other important boundaries:

- Web Push registration accepts only validated public browser push-service endpoints and revalidates them before delivery.
- User-specific RSVP names, confirmation state, waitlist information, notification read/delete state, and notification preferences are never put on the public notification board.
- Web Push signals remain payload-free; account/category metadata stays inside encrypted runtime state.
- The Worker API emits CSP/anti-framing/content-type/referrer/permissions security headers.
- Tests, smoke checks, builds, deploys, watchdog health events, commits, PRs, and score-only changes never send user notifications.
- Exact Q&A text is retained only under the narrow documented conditions and time limits.

More detail: [Data and Privacy](https://github.com/vudh1/ballerwatch/wiki/Data-and-Privacy) · [Architecture](https://github.com/vudh1/ballerwatch/wiki/Architecture)

## Scheduling

| Work | Cadence | Executor |
| --- | --- | --- |
| Pickup watcher | every 2 minutes | cron-job.org → GitHub Actions |
| RATS watcher | every 5 minutes | cron-job.org → GitHub Actions |
| Watchdog + weather | every 6 hours | GitHub Actions |
| Release eligibility | hourly | GitHub Actions |
| Web API | on demand | Cloudflare Worker |
| Calendar sync | on reconciled RATS changes | GitHub Actions → Apps Script |

## Release flow

1. Create `release/<version>` from current `main`.
2. Implement and pass **Validate code**.
3. Update `features/versions.json` and current docs.
4. Open a PR to `main`; squash merge only after checks pass.
5. Promotion publishes the GitHub Release and advances `production`.
6. Worker readiness must pass before Pages deploys.
7. The open PWA auto-refreshes when the complete release is live.

Automatic promotion uses a 24-hour soak; an administrator can manually request promotion without bypassing validation.

See [Release Process](https://github.com/vudh1/ballerwatch/wiki/Release-Process) and [Versions](https://github.com/vudh1/ballerwatch/wiki/Versions).

## Required configuration

| Area | Configuration |
| --- | --- |
| Core runtime | `TRACKER_STATE_KEY`, `OWNER_RSVP_NAME`, `UPSTREAM_ENDPOINT` |
| GitHub/scheduling | `CRON_GITHUB_PAT`, `CRON_JOB_ORG_API_KEY`, `RELEASE_GITHUB_TOKEN` |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| AI | `GEMINI_API_KEY`, `GROQ_API_KEY` |
| Calendar | `GOOGLE_CALENDAR_WEBHOOK_URL`, `GOOGLE_CALENDAR_WEBHOOK_SECRET` |
| Recovery | temporary `BALLERWATCH_RECOVERY_PASSWORD` |

Web Push VAPID material is generated by BallerWatch and stored encrypted in runtime state.

## Local validation

```bash
node --test
node backend/infra/validate-versions.mjs
node scripts/privacy-audit.mjs
```

With an authenticated repository checkout, runtime-state changes should also run:

```bash
node backend/shared/runtime-state.mjs audit
```

Tests and smoke helpers must remain notification-silent and must not mutate Google Calendar.

## Copyright

Copyright © 2026 BallerWatch. All rights reserved. See [COPYRIGHT.md](COPYRIGHT.md) for the repository publication notice.

## Failure behavior

- **Cloudflare unavailable:** live app API/Q&A/board reads fail closed; scheduled GitHub reconciliation can continue.
- **runtime-state unavailable:** supported workflows may recover from the encrypted last-known Actions cache.
- **RATS temporarily unavailable:** bounded retries run; a verified last-good schedule may be retained for transient source failures.
- **Invalid release/content credentials:** release/deployment readiness fails closed.
- **Web Push:** once a validated subscription is stored, delivery does not require Cloudflare at send time.

## More documentation

[Wiki home](https://github.com/vudh1/ballerwatch/wiki) · [Versions](https://github.com/vudh1/ballerwatch/wiki/Versions) · [Operations](https://github.com/vudh1/ballerwatch/wiki/Operations) · [Development](https://github.com/vudh1/ballerwatch/wiki/Development)

Copyright © 2026 BallerWatch. All rights reserved. See `COPYRIGHT.md`.

# BallerWatch

BallerWatch is a privacy-first soccer PWA for pickup games and Seattle RATS league matches. It brings schedules, RSVP capacity, weather, reminders, league updates, an in-app match calendar, and quick answers into one installable app.

**Current source version: 10.0.1**

[Open BallerWatch](https://vudh1.github.io/ballerwatch/) · [Version guide →](https://github.com/vudh1/ballerwatch/wiki/Versions) · [GitHub Releases](https://github.com/vudh1/ballerwatch/releases)

> `main` is reviewed source. `production` is the exact released commit. The live app changes only after a validated promotion.

## What you can do

- **One BallerWatch at the main address:** a two-second brand launch, full-screen scroll hero with a stadium audience and camera flashes behind feature text, then the original matchday cards. A single badged AI icon fades in with the cards and opens AI, Settings and Notifications. The brand splash no longer has a skip button; the later intro skip retains upward rewind. Old `/v2/` links redirect to the root; account, RSVP, Calendar, AI, notification and administration features use the same controller and encrypted backend. See the [cinematic app and migration guide](docs/wiki/V2.md).

- See the next **Pickup** or **League** match with a cleaner visual hierarchy for location, weather, RSVP, and secondary actions. Newly published RSVP dates remain in the match-card carousel and expanded calendar even beyond the initial 14-day grid; missing field details show *Venue to be announced* until the RSVP source publishes a location.
- See RSVP capacity for pickup games; tap the capacity area to open the full-width roster sheet and RSVP from inside it.
- **Share just the field:** the Share button sends the RATS-published Google Maps venue link (or a verified GPS/field-name lookup fallback) with no team names, match date, or kickoff summary; clipboard fallback copies the same link.
- Browse a rolling match calendar and swipe between match cards; on desktop, the waterfall stays visually full-height while the Pickup/League Edit/Delete trigger keeps pointer priority over the carousel hit area.
- **Follow RATS Standings as a card train:** swipe between individual full-width team cards or use subtle edge arrows. Each current-season division table highlights your team, and tapping another team opens its indexed scored match history. The compact table shows played, W-D-L, goal difference and points. Results-based rankings are provisional.
- Use a real **Inbox** with Pickup / League / App filters, mark-all-read, swipe delete, and account-synced read state.
- Choose account-level notification categories and keep the unread count synchronized to the installed app badge on supported devices.
- Get allowed Web Push reminders and real schedule-change notifications.
- **Dynamic pickup capacity alerts:** RSVP bookings trigger at **25%, 50%, and 75%** of each published match's capacity, then each additional occupied spot through full. Thresholds round up to whole reservations (e.g., 16 slots alerts at 4, 8, 12, 13, 14, 15, and 16). A new match starts with a silent baseline, so past thresholds are not replayed; cancellations or settings-only capacity changes do not trigger booking alerts. The 24-hour RSVP and one-hour kickoff reminders remain separate, and muting/snoozing is honored.
- Open the **AI icon** for three connected sections: **AI / Settings / Notifications**, including the unread badge.
- Ask **BallerWatch AI** about opponents, match fields, jersey colors, weekly briefings, next games, and indexed RATS results—with follow-ups for a specific fixture.
- Sign in with separate user accounts and revocable sessions.
- For administrators: manage users, monitored RATS teams, reversible match overrides/deletes, and app promotion.
- Get verified RATS schedule-change updates directly in BallerWatch, with no Google account or Calendar permissions.

Saturday synthetic pickup is shown simply as **Pickup** and has no RSVP/capacity watcher.

## Demo

![BallerWatch animated demo: cinematic launch, stadium audience and camera flashes, feature tour, original match cards, calendar, standings, the AI / Settings / Notifications hub and aligned Inbox preferences](docs/demo.gif)

The original 727-frame walkthrough of the deployed 9.1.1 app, retimed from 36.4 to 22 seconds without removing or re-encoding any frames. Match details, answers and Inbox entries use synthetic sample data; the recording does not read production accounts or change RSVP or notification state.

[Open BallerWatch](https://vudh1.github.io/ballerwatch/)

## What's new

**v10.0.1** — Restore dependable RATS standings by sending only monitored/selected team predictions, keeping the response small enough for on-device caching, and automatically retrying after transient cold-start failures.\n\n**v10.0.0** — A single uninterrupted first-install launch; Google Calendar integration is retired. BallerWatch's own match calendar, schedule alerts, and Web Push remain available to every visitor without a Google connection.

**v9.1.2** — Remove Skip to matches from the loading splash, align the upper-right × across AI / Settings / Notifications, and make the full README animation about 22 seconds without cutting scenes.

**v9.1.1** — Reload after Skip restores the main-page position. Weekly scouting evaluation now runs when due inside the hourly writer, avoiding cancelled standalone evaluation jobs.

**v9.1.0** — Faster shot, later keeper reaction, equal-length arms and captain #10 with short sleeves. One AI hub replaces detached header controls. Skip preserves rewind. Evidence-led scouting preparation and weekly Groq/Gemini model proposals are tested against independent historical results before probability changes are eligible. See [Scouting model](docs/wiki/Scouting.md).

**v9.0.0** — The cinematic app takes over the main address. Add audience/camera flashes, fade Settings/Inbox with the card reveal, remove replay/version controls, and align notification checks. Old V2 links redirect to the canonical app.

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
  |--> RATS schedule detection + Web Push
  |--> watchdog/weather every 6 hr
  |--> release promotion/deployment
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
  league/                 RATS watcher + direct schedule-change detection
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
| Scouting snapshots | hourly | GitHub Actions; bounded dual-provider fact ranking at most daily |
| Scouting model | every 7 days, checked hourly | Same GitHub Actions scouting writer; independent holdout gates |
| Web API | on demand | Cloudflare Worker |

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

Tests and smoke helpers must remain notification-silent.

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

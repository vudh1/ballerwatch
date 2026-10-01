# Architecture

BallerWatch separates the fast Telegram path from durable watcher state.

## Telegram listener boundary

Cloudflare is the only Telegram webhook receiver. GitHub listener runs accept injected Telegram updates or privacy-minimized fast-path history events only. They never call Telegram `getUpdates`; an empty workflow dispatch is a no-op. When scheduler management access is available, BallerWatch also disables any legacy cron-job.org Telegram polling job.

## Request path

Telegram sends webhook updates to the Cloudflare Worker. Common read-only questions are answered there from a short-lived Workers Cache backed by encrypted files on the GitHub `runtime-state` branch.

State-changing or unsupported requests are dispatched to the GitHub listener workflow.

## Notification boundary

Telegram has a narrow allowlist. Proactive sends come only from the pickup watcher, real league schedule changes, and the once-per-Pacific-day combined version announcement. Direct replies are sent only in response to owner input.

Watchdog health/recovery, CI/tests, builds/deploys, commits/PRs, setup reminders, invalid-setting reminders, and score-only changes never generate Telegram messages.

The version announcer runs alongside the watchdog schedule but is independent of watchdog health alerts. It reads `features/versions.json`, combines every pending release into one user-facing message, and defers rather than sends when the watchdog itself is unhealthy.

## Scheduler path

cron-job.org is the primary scheduler:

- pickup every 2 minutes;
- RATS league every 5 minutes;
- watchdog every 10 minutes.

The scheduled jobs dispatch GitHub Actions directly. Cloudflare Cron Triggers are disabled.

## Runtime platform

GitHub Actions runtime code is dependency-free Node.js 22 / ECMAScript modules. League source normalization, Calendar reconciliation, bridge clients, Telegram notification formatting, state helpers, and tests use one runtime while the Apps Script bridge remains Google Apps Script JavaScript.

## Durable state

The `runtime-state` branch is the durable runtime store. Private state is AES-GCM encrypted before it is written. Workflows materialize state temporarily, persist only changed files, and clean local runtime paths afterward.

GitHub Actions cache keeps encrypted last-known backups for recovery.

## Chat review

Telegram conversations may be retained for up to 48 hours as Groq-condensed encrypted records. Only sanitized engineering signals are readable by the scheduled maintenance task.

## Gemini-first answer path

Common questions retain deterministic routing. Remaining read-only questions try Gemini Flash
(`gemini-3.8-flash`) before Groq, then return to non-AI handling if both fail. The Worker only
accepts known intent labels and renders facts itself. The listener rejects action requests and
completion claims; models receive no tools. Each provider attempt consumes the existing AI budget.
Requests have bounded inputs, outputs and timeouts (1.2 seconds at the edge, 2.5 seconds in Actions).
The Cache API edge budget is best-effort per location, not a global billing limit.

Gemini authentication uses the `GEMINI_API_KEY` repository secret, deployed to the Worker.
Chat condensation remains on Groq and retains the encrypted 48-hour history design.

Scheduler configuration audits are cached for 6 hours in encrypted watchdog state, limiting
routine management-API reads to 4/day. The watchdog still runs every 10 minutes and checks
webhook, validation and privacy each time. Cached failures remain failures. Release smoke makes
a fresh scheduler API check when available; temporary management-API failures such as HTTP 429
are warnings, while any successfully retrieved missing, disabled, duplicated, mistargeted, or
wrong-cadence scheduler posture still fails. The same temporary-unavailability rule applies to
post-merge scheduler setup and the final scheduler step of Worker deployment, so cron-job.org
quota exhaustion cannot mark an otherwise healthy Worker deployment as failed. Source polling
cadences remain 2/5/10 minutes.

A readable runtime-state branch is authoritative, including missing files after PURGE. Encrypted
backup recovery applies only when the branch cannot be fetched, never to individual absent files.

## Feedback-driven answer quality

The 48-hour chat review is an engineering feedback loop, not online model training. Privacy-minimized recurring failures can be promoted into deterministic intent phrases, regression tests, and bounded prompt examples. Raw Telegram text is not committed to source or used as a persistent training corpus.

Common factual soccer questions should prefer deterministic runtime-state answers. Gemini Flash is the first bounded fallback for unfamiliar read-only wording, with Groq next; neither model receives action tools.

## Runtime-state history retention

`runtime-state` is a snapshot branch, not an audit log. Each successful state write constructs the complete current encrypted tree as a parentless commit and updates the branch only if the expected previous head is still current. A concurrent writer causes a retry against the newer snapshot.

This keeps one reachable commit on `runtime-state` while preserving the existing encrypted-file boundaries and concurrent pickup/league/listener/watchdog updates. The snapshot tree is built only from the canonical runtime paths, so repository source files never appear on `runtime-state`. PURGE uses the same mechanism and produces an empty runtime tree.


# Architecture

BallerWatch 2.4 separates the fast Telegram path from durable watcher state.

## Request path

Telegram sends webhook updates to the Cloudflare Worker. Common read-only questions are answered there from a short-lived Workers Cache backed by encrypted files on the GitHub `runtime-state` branch.

State-changing or unsupported requests are dispatched to the GitHub listener workflow.

## Scheduler path

cron-job.org is the primary scheduler:

- pickup every 2 minutes;
- RATS league every 5 minutes;
- watchdog every 10 minutes.

The scheduled jobs dispatch GitHub Actions directly. Cloudflare Cron Triggers are disabled.

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
wrong-cadence scheduler posture still fails. Source polling cadences remain 2/5/10 minutes.

A readable runtime-state branch is authoritative, including missing files after PURGE. Encrypted
backup recovery applies only when the branch cannot be fetched, never to individual absent files.

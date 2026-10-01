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

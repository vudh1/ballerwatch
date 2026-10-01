# Architecture

## Request path

Telegram sends webhook updates to the Cloudflare Worker. Read-only questions are answered at the edge when possible. State-changing or unsupported requests are dispatched to GitHub Actions.

## Scheduled path

Cloudflare Cron Triggers perform lightweight pickup and RATS change detection. cron-job.org is an independent external failover scheduler. Its jobs remain enabled, but fallback-dispatched pickup/league workflows first check Cloudflare health and skip expensive source work when edge heartbeats are fresh.

## State

Cloudflare KV is the primary runtime datastore. GitHub Actions can materialize runtime state temporarily and clean it before completion. Encrypted GitHub Actions cache backups provide a last-known-state fallback if the Worker/KV API path is unavailable.

## Reconciliation

GitHub Actions owns heavier work:
- pickup notification reconciliation;
- full RATS schedule validation;
- score-change handling;
- Google Calendar writes;
- deep watchdog checks;
- deployment and CI.

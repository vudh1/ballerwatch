# Runtime and Failover

## Normal path

1. Cloudflare Worker serves the PWA API, auth, push registration, and public-safe reads.
2. cron-job.org dispatches pickup and league GitHub workflows at 2/5-minute cadence.
3. GitHub Actions reconcile source data, write encrypted `runtime-state`, update Calendar, and deliver allowed Web Push.
4. Native GitHub watchdog/weather runs every 6 hours.

## Runtime storage

`runtime-state` is the durable generated-state authority. Every canonical file is encrypted. A successful branch read is authoritative even when a file is absent after PURGE; encrypted cache backup is used only when the branch itself cannot be read.

## Cloudflare failure

Live PWA API/Q&A/board reads are temporarily unavailable. Pickup/league scheduling and native GitHub maintenance continue.

## GitHub runtime-state failure

Supported workflows may restore the encrypted last-known Actions-cache backup. They must not publish decrypted recovery data.

## Source failure

Transient league-source failure preserves a validated last-good schedule instead of replacing it with an empty result.

## Push delivery

Once a validated subscription is stored, GitHub Actions sends directly to browser push providers. Delivery does not require the Worker to be online.

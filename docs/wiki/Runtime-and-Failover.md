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

### Monthly RSVP name-only snapshot (v11.10.0)

The first-of-month `rsvp-roster-monthly.yml` Actions workflow (10:43 UTC, plus manual dispatch) checks out `production` and skips safely if the indexed feature is not yet released. It discovers the current public `nhcuong95/rsvp` RSVP Apps Script endpoint from the public frontend and requests only the documented `listRoster` action. Data is checked and projected to names only, encrypted with `TRACKER_STATE_KEY`, and saved into the dedicated canonical `roster` scope at `pickup/state/roster-catalog.json`. Only `pull roster`, encrypted `push roster`, and the normal full-branch `audit` operate on this private file; pickup's frequent notification cron and public web snapshot never access it. Missing, malformed, oversized or empty upstream data aborts without overwriting the last good encrypted snapshot. No PWA/API exposure, Web Push, separate Worker cron, or Vela/FRIDAY contract change. If the source changes its API or access policy, fix the importer before re-enabling the job; do not fall back to private admin exports.

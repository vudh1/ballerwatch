# Architecture

BallerWatch keeps the soccer domain model separate from delivery/storage providers. The PWA is the primary product surface; Telegram remains an optional adapter.

## Request paths

### Public/read-only web

```text
PWA -> Cloudflare Worker -> encrypted runtime-state / short-lived cache
```

Common schedule/RSVP/weather questions are answered deterministically when possible. Gemini Flash, then Groq, is used only as a bounded read-only fallback; neither model receives action tools.

### User-authenticated settings

```text
PWA -> /web/user/* -> signed device capability
                    -> encrypted runtime-state / listener persistence
```

The authenticated surface is deliberately narrow: pickup RSVP display name and monitored league teams.

A user password is the normal sign-in path after bootstrap. `/webpair` is a temporary recovery/bootstrap path. Legacy pre-5.8 route aliases and tokens remain accepted during migration.

### Telegram

Telegram sends webhooks to the Cloudflare Worker when that adapter is configured. Common read-only questions may be answered at the edge; state-changing or unsupported requests are dispatched to the GitHub listener.

The listener is event-driven. It is not a recurring `getUpdates` poller.

## Watcher path

```text
cron-job.org --2 min--> Pickup watcher ----+
cron-job.org --5 min--> RATS watcher ------+--> encrypted runtime-state
                                            +--> allowed notifications
                                            +--> Calendar when reconciliation requires it

GitHub schedule --6 hr--> Watchdog + 14-day weather + encryption audit
```

The retired external watchdog and legacy Telegram polling schedule remain disabled.

## Notification boundary

Proactive Telegram/Web Push is limited to:

- pickup RSVP/capacity changes;
- real RATS schedule changes;
- one combined version-change announcement per Pacific day.

Direct Telegram replies are allowed only in response to authenticated user input.

Tests, smoke runs, watchdog health events, deploys, commits/PRs, setup reminders, and score-only changes are silent.

## Runtime storage

`runtime-state` is a generated snapshot branch, not an audit log.

Each canonical file is one authenticated AES-GCM envelope. Successful writes build the complete current canonical runtime tree as a parentless snapshot and update the branch using an optimistic force-with-lease. Concurrent writers retry against the newer snapshot.

This gives BallerWatch:

- no readable runtime payloads in Git history;
- one reachable runtime snapshot instead of unbounded state history;
- safe concurrent pickup/league/listener/watchdog updates;
- a storage contract that can move to another backend later.

## Runtime encryption migration

5.8 treats complete top-level encryption as an invariant. The shared runtime helper can read legacy partial/plain projections solely to migrate them. New pushes are rejected if a canonical runtime file is not encrypted.

Worker deployment visits every runtime scope, pushes migrated envelopes, then audits the branch. The six-hour watchdog repeats the audit.

## Review and feedback

Exact question/answer text is retained for at most 48 hours only for user-authenticated exchanges or an anonymous answer explicitly marked **Wrong answer**.

A separate sanitized engineering projection is generated from those retained exchanges. That projection is also encrypted at rest.

Wrong-answer authorization is scoped to the exact answer and does not grant Settings access.

## Production boundary

`main` is integration. `production` is the live code pointer. A GitHub Release/tag is the promotion record tying one product version to one exact commit.

Production watcher/listener jobs check out `production`; release deploys use the published tag/production ref. This lets `main` continue evolving without changing the live system.

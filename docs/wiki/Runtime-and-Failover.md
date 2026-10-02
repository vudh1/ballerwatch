# Runtime and failover

BallerWatch keeps provider roles separate so one outage does not become a full-system outage.

1. **Cloudflare Worker:** public-safe PWA API, fast read-only answers, user authentication, and optional Telegram webhook.
2. **Workers Cache:** short-lived best-effort cache only; never authoritative storage.
3. **cron-job.org:** pickup every 2 minutes and league every 5 minutes.
4. **GitHub Actions:** reconciliation, notifications, Calendar work, release/deploy operations, and the six-hour watchdog/weather schedule.
5. **runtime-state:** durable generated state; every canonical file is a complete AES-GCM envelope.
6. **Actions cache:** encrypted last-known recovery backup.

Workers KV and Cloudflare Cron Triggers are not production dependencies.

## Failure behavior

If Cloudflare is unavailable, live PWA API reads and inbound Telegram webhook commands are temporarily unavailable. cron-job.org and GitHub Actions continue pickup/league monitoring; the native six-hour watchdog/weather schedule remains independent.

If Telegram is disabled, the PWA, user-password Settings, Web Push, soccer monitoring, and Calendar reconciliation remain usable.

If `runtime-state` cannot be read, GitHub workflows may restore the encrypted Actions-cache backup. If the Worker cannot directly persist short-lived answer history, it may dispatch the GitHub listener as a persistence fallback.

If the RATS source fails transiently, the league watcher retains the validated last-good schedule rather than replacing it with an empty schedule.

## Encryption fail-closed behavior

Worker deployment migrates legacy runtime files through the shared state helper and then audits the branch. The six-hour watchdog repeats the structural audit.

A canonical runtime file that is not an AES-GCM envelope is an operational failure; it is not treated as an acceptable readable projection.

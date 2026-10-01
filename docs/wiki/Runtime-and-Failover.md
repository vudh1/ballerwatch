# Runtime and failover

BallerWatch uses independent layers so the Cloudflare KV quota is not a production dependency.

1. **Cloudflare webhook:** receives Telegram updates and handles common read-only answers.
2. **Workers Cache:** short-lived best-effort cache only; it is not authoritative storage.
3. **cron-job.org:** primary 2/5/10-minute scheduler for pickup, league, and watchdog.
4. **GitHub Actions:** performs source checks, notifications, Calendar reconciliation, and state-changing listener work.
5. **runtime-state branch:** durable generated state, with private payloads encrypted.
6. **Actions cache:** encrypted last-known recovery backup.

Workers KV and Cloudflare Cron Triggers are not used by the production 2.4 runtime.

If Cloudflare is unavailable, new inbound Telegram webhook commands are temporarily unavailable, but cron-job.org and GitHub continue core soccer monitoring and outbound watcher notifications.

If the runtime-state branch cannot be read, GitHub workflows may restore the encrypted Actions-cache backup. If the Worker cannot directly persist a fast-path chat-history entry, it may dispatch the GitHub listener as a persistence fallback.

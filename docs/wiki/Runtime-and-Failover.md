# Runtime and failover

BallerWatch uses layered failure handling instead of one scheduler.

1. **Cloudflare primary:** webhook, KV, fast Q&A, and 2/5/10-minute edge checks.
2. **cron-job.org external failover:** enabled jobs dispatch pickup every 2 minutes, league every 5 minutes, and watchdog every 10 minutes.
3. **Fallback gate:** pickup/league GitHub workflows immediately skip expensive work while the corresponding Cloudflare heartbeat is fresh.
4. **Worker/KV access fallback:** workflows restore encrypted last-known runtime state from GitHub Actions cache when the Worker runtime-state API is unavailable.
5. **Telegram remains independent:** GitHub workflows can still send Telegram alerts if Cloudflare is unavailable.

If Cloudflare is fully unavailable, the public web app/API will be unavailable, but the enabled external cron plus GitHub/Telegram path can continue core monitoring using the encrypted backup state.

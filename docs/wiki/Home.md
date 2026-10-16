# BallerWatch Wiki

BallerWatch is a privacy-first soccer PWA for pickup RSVP monitoring and Seattle RATS league matches.

The GitHub Pages PWA is the sole user surface. Cloudflare provides the web API/authentication layer, GitHub Actions handles reconciliation and Web Push delivery, cron-job.org dispatches the high-frequency pickup/league watchers, and the RATS watcher publishes match-schedule updates directly to the in-app calendar and Web Push.

Start with:

- [Versions](Versions) — source vs production versions, release history, and app-update behavior
- [Architecture](Architecture)
- [Web App](Web-App)
- [Cinematic app and migration](V2)
- [Scouting and forecasts](Scouting)
- [Data and Privacy](Data-and-Privacy)
- [Runtime and Failover](Runtime-and-Failover)
- [Operations](Operations)
- [Release Process](Release-Process)
- [Development](Development)

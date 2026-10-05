# BallerWatch Wiki

BallerWatch is a privacy-first soccer PWA for pickup RSVP monitoring and Seattle RATS league matches.

The GitHub Pages PWA is the sole user surface. Cloudflare provides the web API/authentication layer, GitHub Actions handles reconciliation and Web Push delivery, cron-job.org dispatches the high-frequency pickup/league watchers, and Google Apps Script provides Calendar reconciliation.

Start with:

- [Versions](Versions) — source vs production versions, release history, and app-update behavior
- [Architecture](Architecture)
- [Web App](Web-App)
- [Data and Privacy](Data-and-Privacy)
- [Runtime and Failover](Runtime-and-Failover)
- [Operations](Operations)
- [Release Process](Release-Process)
- [Development](Development)

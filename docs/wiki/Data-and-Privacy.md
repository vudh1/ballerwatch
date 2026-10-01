# Data and privacy

The public repository contains no live participant rosters, private settings, runtime snapshots, Telegram credentials, or Calendar IDs.

Primary runtime data is stored in Cloudflare KV. GitHub Actions may temporarily materialize it in an ephemeral runner.

For outage resilience, BallerWatch may keep **encrypted** last-known runtime backups in GitHub Actions cache. The cache payload is encrypted before storage using the same state-encryption boundary as the runtime state.

Purging runtime data clears generated state and user-modified league-team runtime configuration so built-in defaults can bootstrap again.

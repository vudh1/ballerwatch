# Development

## Source layout

```text
frontend/web/             static/installable PWA
backend/infra/            Cloudflare Worker + scheduler helpers
backend/pickup/           pickup source and notification logic
backend/league/           RATS watcher + Calendar integration
backend/shared/           encryption, runtime state, auth, push, common logic
backend/watchdog/         health/release monitoring
backend/weather/          weather pipeline
tests/frontend/           frontend-only tests
tests/backend/            backend tests mirrored by domain
scripts/                  repository tooling
docs/wiki/                maintained documentation
```

Canonical encrypted runtime-state paths such as `pickup/state/`, `league/state/`, and `state/` intentionally remain unchanged. They are storage contracts rather than source directories.

## Before editing

Read `AGENTS.md`, `STYLE_GUIDE.md`, and `features/versions.json`. Work on a dedicated branch from latest `main`.

Runtime modules are dependency-free Node.js / ESM where practical. Keep provider integrations at the edges and pure logic testable.

## Local checks

```bash
node --test
node backend/infra/validate-versions.mjs
node scripts/privacy-audit.mjs
```

With an authenticated checkout, runtime-state changes should also run:

```bash
node backend/shared/runtime-state.mjs audit
```

Tests and smoke helpers must not send Web Push or mutate Google Calendar.

The validation suite also verifies relative imports and rejects reintroduction of the retired messaging integration, its credentials, webhook route, and removed paths.

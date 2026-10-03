# Development

## Layout

- `infra/web-worker/` — Cloudflare web/PWA API and edge runtime.
- `pickup/` — pickup source and notification policy.
- `league/` — RATS source, Calendar reconciliation, web notification generation.
- `weather/` — match-window forecasts.
- `shared/` — encryption, runtime state, user recovery, Web Push, AI/common logic.
- `tests/` — test-only source.
- `.github/workflows/` — validation, runtime, release, recovery, deployment.

## Before editing

Read `AGENTS.md`, `STYLE_GUIDE.md`, and `features/versions.json`. Work on a dedicated branch from latest `main`.

Runtime modules are dependency-free Node.js 22 / ESM where practical. Keep provider integrations at edges and pure logic testable.

## Local checks

```bash
node --test
node infra/validate-versions.mjs
node privacy-audit.mjs
```

With an authenticated checkout, runtime-state changes should also run:

```bash
node shared/runtime-state.mjs audit
```

Tests and smoke helpers must not send Web Push or mutate Google Calendar.

The validation suite includes a regression guard that prevents the retired messaging integration, its credentials, webhook route, and removed paths from being reintroduced.

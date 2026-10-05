# Tests

All test-only code stays under `tests/`, separate from production source.

## Layout

- `tests/frontend/` — PWA markup, styling, install/update, and browser-facing regression tests.
- `tests/backend/infra/` — workflow-adjacent infrastructure and Cloudflare Worker tests.
- `tests/backend/pickup/` — pickup ingestion and notification tests.
- `tests/backend/league/` — RATS watcher and Calendar integration tests.
- `tests/backend/shared/` — shared state, security, routing, and persistence tests.
- `tests/backend/watchdog/` — watchdog and release-announcement policy tests.
- `tests/backend/weather/` — weather relevance and refresh tests.
- `tests/backend/smoke/` — notification-silent live smoke helpers.

CI discovers dependency-free Node.js `*.test.mjs` files recursively under `tests/`.

Tests and smoke helpers must never send Web Push notifications or mutate Google Calendar.

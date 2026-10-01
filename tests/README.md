# Tests

All test-only code lives under this directory so runtime/source folders contain production code only.

The directory mirrors the source layout:

- `tests/shared/` — shared state, AI, routing, and persistence unit tests.
- `tests/infra/` — scheduler, fallback, and Cloudflare Worker tests.
- `tests/pickup/` — pickup-source tests.
- `tests/league/` — league watcher and Calendar bridge client tests.
- `tests/watchdog/` — watchdog policy tests.
- `tests/smoke/` — notification-silent live smoke helpers.

CI discovers dependency-free Node.js `*.test.mjs` files under `tests/`.

Tests and smoke helpers must not send Telegram notifications or mutate Google Calendar.

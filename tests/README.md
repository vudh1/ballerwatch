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

## Production tester

After deployment, run `BALLERWATCH_PLAYWRIGHT_MODULE=/tmp/ballerwatch-browser/node_modules/playwright node tests/frontend/production-tester.mjs` with pinned Playwright 1.56.1 and Chromium installed. It opens ten fresh production sessions for desktop/mobile launch, repeated Skip/rewind, all hub sections, aligned notification checks, synthetic Q&A, keyboard dismissal, legacy deep links, landscape resizing, public-cache outage recovery and installed-worker offline launch. Deployed assets are byte-checked against the checkout. Public GETs use real production data; all mutation methods are blocked, and Q&A alone is intercepted with a synthetic response. Logs contain pass/fail metadata, not match/roster/answer payloads. Screenshots/results go to a temporary output directory.

The tester warms byte-verified production assets before timed animation checks. Anonymous public API reads are relayed through Node with the real Origin/header contract because the restricted headless browser UA is challenged at the edge. With `BALLERWATCH_CHROMIUM_SHELL=1`, only the unavailable native OS badging bridge is replaced in the worker context; fetched production worker bytes remain unchanged. Network interception is removed before the actual worker-controlled offline navigation. Full unmodified Chromium/WebKit run separately in CI.

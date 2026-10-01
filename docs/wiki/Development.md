# Development

Read `AGENTS.md`, `README.md`, `STYLE_GUIDE.md`, and `features/versions.json` before changing code.

## Local concepts

- Runtime source code: `infra/telegram-webhook/`
- Telegram fallback bot: `listener/`
- Pickup reconciliation: `pickup/`
- RATS reconciliation: `league/`
- Shared state/crypto/intent helpers: `shared/`
- Operations helpers: `infra/`
- Workflows: `.github/workflows/`

Use the repository style rules. Prefer small pure modules for parsing, normalization, routing, and formatting, with side effects kept at the edges.

BallerWatch runtime and tests use Node.js 22 with ECMAScript modules. No Python runtime or Python setup is required by GitHub Actions.

Tests must not send Telegram messages or mutate Calendar.

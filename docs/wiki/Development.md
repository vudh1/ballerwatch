# Development

Read `AGENTS.md`, `README.md`, `STYLE_GUIDE.md`, and `features/versions.json` before changing code.

## Repository map

- `docs/` — installable PWA and maintained wiki source.
- `infra/telegram-webhook/` — Cloudflare Worker / public-safe API / optional Telegram adapter.
- `listener/` — event-driven command and state-changing fallback.
- `pickup/` — pickup source and notification reconciliation.
- `league/` — RATS source and Calendar reconciliation.
- `weather/` — match-window forecast pipeline.
- `shared/` — encryption, runtime-state, push, intent, and provider-neutral helpers.
- `features/` — product version ledger.
- `tests/` — test-only source mirroring runtime areas.
- `.github/workflows/` — validation, runtime, release, deployment, and recovery workflows.

## Design rules

Prefer small pure modules for parsing, normalization, routing, and formatting. Keep network, storage, notifications, and provider-specific side effects at the edges.

When a module starts owning more than one domain:

1. extract provider-neutral logic to `shared/`;
2. keep the adapter thin;
3. export pure functions;
4. add `node:test` coverage before changing behavior.

Do not move private state into a new backend merely to simplify code. The top-level AES-GCM runtime envelope is a storage contract and should survive future storage-provider changes.

## Runtime-state changes

Every canonical `runtime-state` file must be a complete encrypted envelope. New code should use the shared state helpers instead of inventing a plaintext projection.

For an authenticated checkout:

```bash
node shared/runtime-state.mjs audit
```

The audit checks structure only; it never prints decrypted state.

## Product vs maintenance changes

Product behavior uses `release/<version>` and SemVer.

Documentation-only edits, behavior-preserving refactors, tests, comments/formatting, and CI/tooling maintenance do not consume a product version.

## Tests

BallerWatch runtime and tests use Node.js 22 with ECMAScript modules.

Tests must not:

- send Telegram messages;
- send Web Push signals;
- mutate Google Calendar;
- upload decrypted runtime artifacts.

Runtime-impacting release PRs also use the notification-silent Manual smoke workflow.

# BallerWatch code style

This repository uses one consistent style across runtime code, workflows, tests, documentation, and the web app.

## General

- UTF-8, LF line endings, final newline, no trailing whitespace.
- Prefer small modules with one responsibility over large multi-purpose files.
- Every runtime source file starts with a short module documentation block describing responsibility, inputs/outputs, privacy boundaries, and the release in which its documentation baseline was added.
- Public functions should have descriptive names; avoid unexplained abbreviations.
- Secrets, participant identities, runtime snapshots, and other private state never appear in source, logs, fixtures, or documentation.
- Every canonical `runtime-state` file is stored as one complete AES-GCM envelope. Do not add readable projections or metadata files to that branch.
- User-facing product copy says **user**, not **owner**. Legacy internal identifiers may remain only when changing them would break persisted tokens, API compatibility, or external secret names; add a compatibility comment when that distinction is non-obvious.
- Comments explain **why** a rule exists, not line-by-line syntax.

## JavaScript / MJS

- ECMAScript modules only for application/runtime modules. The PWA service worker may remain a classic service worker script for broad browser compatibility.
- 2-space indentation, semicolons, double quotes.
- Prefer `const`; use `let` only for reassignment.
- Prefer `async/await` over promise chains.
- Keep pure parsing/formatting functions separate from network/storage side effects.
- Export reusable logic and cover it with `node:test`.
- Keep functions focused; when a module grows beyond one domain, split it.

## Tests

- All test-only source lives under `tests/`, mirroring the production source area where practical.
- Production source folders should not contain `*.test.mjs` or smoke-only scripts.
- Smoke helpers belong in `tests/smoke/`.
- Tests must remain notification-silent: no Web Push delivery and no Calendar mutation.

## Workflows and configuration

- YAML uses 2-space indentation.
- GitHub Actions should have explicit permissions, timeouts, and concurrency where appropriate.
- Production workflows must not commit runtime data.
- A workflow should own one operational failure domain. Prefer a manual repair workflow over a second automatic trigger when normal deployment already performs the same reconciliation.
- Test workflows must not send Web Push notifications or mutate Calendar data.

## Releases

Normal changes use `release/<version>`, pass validation/smoke tests, then squash into exactly one commit on `main`.

Each release should update:
- `features/versions.json`;
- relevant README/wiki documentation;
- module comments when responsibilities or boundaries change.

Historical release snapshots are not rewritten merely to add comments; current documentation explains the evolution without falsifying old source snapshots.


## Web typography

- Use the native system UI stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- Do not reference an external font unless the font is actually shipped and intentionally approved.
- Reuse the PWA type tokens in `docs/styles.css` instead of adding one-off font sizes.
- Prefer standard font weights 400, 500, 600, 700, and 800; avoid synthetic intermediate weights such as 650 or 750.
- Keep text inputs and textareas at 1rem/16px or larger so iOS does not zoom the page on focus.
- Preserve hierarchy through the shared scale rather than arbitrary size changes.

# Versions

BallerWatch separates **source version**, **production version**, and **runtime state** so repository work cannot silently change the live app.

## The three important refs

| Ref | Meaning |
| --- | --- |
| `main` | Reviewed integration source. It can be newer than the live app. |
| `production` | The exact released commit currently eligible for production workflows and Pages. |
| `runtime-state` | Encrypted generated data only. It is not application source or release history. |

The current product version is recorded in `features/versions.json`.

## Where to see release history

- [GitHub Releases](https://github.com/vudh1/ballerwatch/releases) — published production releases and release notes
- [features/versions.json](https://github.com/vudh1/ballerwatch/blob/main/features/versions.json) — complete product version ledger in source
- [Release Process](Release-Process) — validation and promotion flow

## Version numbers

BallerWatch follows semantic versioning for actual product behavior:

- **PATCH** — backward-compatible reliability, privacy, security, UI, or compatibility fix
- **MINOR** — new backward-compatible capability
- **MAJOR** — a generation-level product/architecture change or an intentional incompatible change

Documentation-only edits, behavior-preserving refactors, tests, formatting, and CI/tooling cleanup do not get a version by themselves.

## What “Update app” does

An administrator pressing **Settings → App** requests the existing validated production-promotion workflow. It does not directly overwrite the live app.

The release then moves through:

1. validation and release eligibility;
2. `production` advancement + GitHub Release publication;
3. Cloudflare Worker deployment and live readiness/security checks;
4. GitHub Pages deployment from the same production release;
5. automatic refresh of an already-open BallerWatch PWA once both Worker and Pages report the target version.

This means an installed app should not need to be manually closed and reopened after a normal promotion.

## Current development line

- **9.1.1** — Correct reload position after Skip and consolidate weekly-due evaluation into the hourly scouting writer.

- **9.1.0** — Realistic late-save choreography and captain #10, single AI/Settings/Notifications hub, rewind after Skip, evidence-led prepared scouting reports and independently gated weekly goal-rate challengers with bounded Groq/Gemini proposals.
- **9.0.0** — Canonical cinematic root app, stadium crowd/flashes, original functional cards and old `/v2/` redirect.

- **8.14.1** — Full-screen stadium, borderless captions and foreground ball/keeper layering.

The complete historical ledger is [features/versions.json](https://github.com/vudh1/ballerwatch/blob/main/features/versions.json). Release-specific evidence remains in GitHub Releases and historical verification receipts; it does not override current operational guidance.

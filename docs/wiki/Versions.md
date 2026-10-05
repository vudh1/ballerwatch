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

An administrator pressing **Settings → App update** requests the existing validated production-promotion workflow. It does not directly overwrite the live app.

The release then moves through:

1. validation and release eligibility;
2. `production` advancement + GitHub Release publication;
3. Cloudflare Worker deployment and live readiness/security checks;
4. GitHub Pages deployment from the same production release;
5. automatic refresh of an already-open BallerWatch PWA once both Worker and Pages report the target version.

This means an installed app should not need to be manually closed and reopened after a normal promotion.

## BallerWatch 7

Version 7 introduces account-backed notification state, a filtered Inbox, per-account notification categories, installed-app badge synchronization, persistent Home / Inbox / Settings navigation, and a cleaner modular PWA client.

Signed-in Inbox read/delete state is merged into the encrypted user profile so multiple devices converge instead of keeping unrelated local histories. Signed-out devices keep a local fallback until the user signs in.

## Current development line

The source ledger on `main` is authoritative for the newest reviewed version. The GitHub Releases page is authoritative for what has actually been published to production. A release branch can therefore show 7.0.0 before 7.0.0 is merged or promoted.

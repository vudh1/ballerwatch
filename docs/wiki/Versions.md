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

Version 7 introduces account-backed notification state, a filtered Inbox, per-account notification categories, installed-app badge synchronization, and a cleaner modular PWA client. In 7.0.1, Inbox and Settings returned to the top-right bell and gear instead of persistent bottom tabs. In 7.0.2, adjacent match cards were tightened into a true edge-to-edge sliding train. In 7.0.3, the adjacent preview is locked to the live card’s exact rendered rail so both cards stay vertically aligned throughout drag and settle. In 7.0.4, the train preview’s absolute positioning is protected from later spotlight-card CSS overrides, preventing the incoming card from dropping into normal document flow.

Signed-in Inbox read/delete state is merged into the encrypted user profile so multiple devices converge instead of keeping unrelated local histories. Signed-out devices keep a local fallback until the user signs in.

## Current development line

The source ledger on `main` is authoritative for the newest reviewed version. The GitHub Releases page is authoritative for what has actually been published to production. A release or fix branch can therefore show a newer version before it is merged or promoted.
- **7.0.5** — Pins the match-card Updated timestamp footer to the card itself so iPhone installed-web-app layout matches the website footer position.
- **7.0.6** — Moves the match-card Updated footer down to the bottom edge and removes the inherited footer min-height that kept it floating too high on iPhone.

- **7.0.7** — Keeps the soccer-pitch background while removing its outer frame, and introduces a new soccer-pitch + ball icon for the PWA and iPhone Home Screen.
- **7.0.8** — Keeps all three notification preferences on one row, presents releases as App update, refreshes signed-in notification counts from shared account state while active, moves calendar/weather freshness into a subtle card footer, and removes the footer weather attribution line.
- **7.0.9** — Makes match freshness time-only and as subtle as weather freshness, removes the match-footer separator, returns selected/swiped matches to Next Game after 6 seconds of inactivity, and adds short interaction vibration on browsers that expose the Vibration API.
- **7.0.10** — Removes the separator above the weather/calendar freshness footer and adds a privacy-safe maintainer audit for sanitized review signals and feature-request category counts.
- **7.0.11** — Fixes review-identified Q&A routing for pickup-specific date details, mixed weekly schedule questions, empty weekdays, and richer Today pickup status.
- **7.0.12** — Adds an original green cinematic BallerWatch launch animation plus optional low-volume synthesized ambient music that starts only after an allowed user interaction and remembers the device setting.
- **7.0.13** — Simplifies Music to a speaker icon in Settings, removes the duplicate Settings scrollbar, and moves Ask BallerWatch into an always-available floating bot dialog.
- **7.0.14** — Keeps Settings and Notifications inside a symmetric iPhone-safe vertical frame below the top system/header area, with matching top and bottom insets.
- **7.0.15** — Fixes the league one-hour reminder handoff so reminders recorded inside the league workflow reach the shared notification board/Web Push sender, and self-repairs recorded-but-undelivered reminders while the match is still upcoming.
- **7.0.16** — Makes the pickup capacity pill open a compact signed-in RSVP roster, ordered by BallerWatch RSVP observation order, with guest counts, waitlist, and outside-tap dismissal.
- **7.0.17** — Makes the cinematic launch own the browser's first paint so the dashboard no longer flashes briefly before the intro, while keeping session and reduced-motion behavior.

# BallerWatch Quiet Glass v1 — design-review candidate (11.11.1)

This is a **frontend-only proposal** against `main`, not a production deployment. [FRIDAY v1](https://github.com/vudh1/friday/blob/main/docs/DESIGN_SYSTEM.md) is the token reference; BallerWatch retains independent implementation. Figma: https://www.figma.com/design/dv0XebWKIeqq6MuheNMzEh

## Current surface inventory (preserved)

First-device setup (three optional steps); intro and immediate Skip; intentional pull-to-rewind; Playing next-game carousel with RSVP, availability, venue, weather, roster and standings; Watching one-mounted-day carousel with schedule, competition, match detail and verified provider links; schedule/day selection, team scouting, notification inbox and Push, AI Q&A, settings/choice search, per-device edits and preferences, ICS subscription management, install UI, service-worker last-good and beta/V2 alias.

## Before → after

- **Before:** green-teal tint is used across nearly every selection, cards use mobile backdrop blur, and controls have competing emphasis. **After:** a charcoal/graphite base, retained soccer-only green accents, sky `#68CFF7` on primary selections and match context, and semantic focus `#BCEAFF`.
- **Before:** Playing/Watching and AI/Settings/Notifications work but visual states compete. **After:** an opaque thumb-friendly 44px switch with selected position, a quieter tab bar and visible keyboard focus. No added fetches or JavaScript animations.
- **Before:** richly blurred cards risk repaint on iPhone Safari. **After:** solid high-opacity cards and detail/first-run surfaces; zero new image assets, shaders or network dependencies.
- **No behavior change:** 366-day source index, Watching single-card mounting, scroll resistance, data freshness, no RSVP admin access, calendar UID/ICS and push subscriptions.

## UI state / representative viewport review checklist

| View/state | 390px iPhone | 430px iPhone | Desktop |
| --- | --- | --- | --- |
| First visit and optional setup | Skip, search, 200% text, safe-area | Choice selection without lag | keyboard setup |
| Returning Playing | swipe, RSVP, rain, venue | next-game card | settings keyboard |
| Watching days | one mounted day, swipe, kickoff | day count, detail link | arrow keys |
| Match details | competition, local time, venue | verified channel conditional | focus return |
| AI/Settings/Notifications | non-overflow tabs, 44px targets | long labels at 200% text | Escape and focus |
| Offline / stale / empty | last-good + clear status | setup recovery | no fabricated fixtures |
| Reduced motion | intro hidden, no selection transition | no card animation | keyboard usable |

**Scroll choreography:** launch animation is skippable; dashboard is usable without it. At dashboard top, a light reverse gesture resists; deliberate continued pull rewinds the scene. Tabs, schedules and day swipes remain independent. Focus/pressed/selected states use semantic text and `--friday-focus-ring`, not color alone.

**Checks:** `node scripts/check-style.mjs`, JS checks, `node --test`, version validation, privacy audit, web build and all Playwright Chromium/Firefox/WebKit jobs in Validate code. CI runs after PR creation. Physical iOS Safari and GPU profiling remain **unverified** until recorded on a device; Playwright WebKit is only an approximation.

**FRIDAY impact:** design-token mapping only; no cross-app contract or runtime dependency. No billing changes. No new assets/rights concerns. Rollback: revert the frontend-only review commit before promotion or build a replacement via the existing release process.

**Release gate:** review → green Validate code → optional notification-silent manual smoke if runtime changes arise → squash to `main` for beta → separate explicit protected production promotion. This PR alone must not merge or deploy.

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

## BallerWatch 7

Version 7 introduces account-backed notification state, a filtered Inbox, per-account notification categories, installed-app badge synchronization, and a cleaner modular PWA client. In 7.0.1, Inbox and Settings returned to the top-right bell and gear instead of persistent bottom tabs. In 7.0.2, adjacent match cards were tightened into a true edge-to-edge sliding train. In 7.0.3, the adjacent preview is locked to the live card’s exact rendered rail so both cards stay vertically aligned throughout drag and settle. In 7.0.4, the train preview’s absolute positioning is protected from later spotlight-card CSS overrides, preventing the incoming card from dropping into normal document flow.

Signed-in Inbox read/delete state is merged into the encrypted user profile so multiple devices converge instead of keeping unrelated local histories. Signed-out devices keep a local fallback until the user signs in.

## Current development line

- **9.1.0** — Realistic late-save choreography and captain #10, single AI/Settings/Notifications hub, rewind after Skip, evidence-led prepared scouting reports and independently gated weekly goal-rate challengers with bounded Groq/Gemini proposals.
- **9.0.0** — Canonical cinematic root app, stadium crowd/flashes, original functional cards and old `/v2/` redirect.

- **8.9.0** — canonical card template and synchronized title/meta/footer scale, identical waterfall opacity and masks on match and standings, bottom-pinned standings Updated. Hourly scouting performs no-leak Spring→Summer→Fall season-forward tests, measures Brier and previous-to-next-season form quality, and adopts revised weights only on proven out-of-time improvements; full history remains only in the version ledger and releases.
- **8.8.0** — exact shared masked waterfall on match/standings cards; touch-first iPhone standings flicks that do not open scouting; authenticated searchable RSVP-name and multi-team chip selectors; hourly indexed team directory; scouting-aware BallerWatch AI with published W/D/L and attack/defense facts; review-guided pickup-versus-league intent fix; independent privacy-safe regression checks.
- **8.7.0** — matched match/standings waterfall navigation and refined typography; App labels and RSVP-style top-right scouting X; division-weighted historical form (D1 > D2a > D2b > D2c > D3, unknown neutral), recent form and head-to-head; rounded provisional win/draw/loss; only versioned encrypted precomputed scouting GETs, no archive scans on page load.
- **8.6.1** — restores missing encrypted prebuilt scouting index at release/bootstrap; bulk background report preloading; bounded public GET timeouts; session-only last-good public calendar recovery; live status decoupled from optional reads; inline post-jersey monitored win chance and matching League Standings heading color.

- **8.6.0** — hourly independent encrypted scouting index, compact Worker read-only retrieval, no per-team browser prefetch flood, better transient public snapshot reuse and corrected offline status handling. Existing ten-game weighted strength/scoring and matchup calculations are preserved.

- **8.5.4** — scoped duplicate-name scouting so teams such as Sitting Ducks resolve within the selected division, shared on-page prefetch cache with source-aware refresh and outage fallbacks, and a conservative matchup-specific win estimate using each side's last 10 scored games plus historic head-to-head instead of misleading raw 100% from two wins.

- **8.5.3** — bounded, reusable public history and derived scouting caches to reduce Worker CPU pressure on repeated team taps, temporary stale-scoring fallback with proper labels, and core calendar isolation from optional weather/venue failures.

- **8.5.2** — decouples critical match/calendar requests from history scanning, reduces match-card layout probes to immediate neighbors, puts calendar ahead of optional startup calls, deduplicates cold Worker loads and shows only the monitored team's compact weighted win percentage in league match cards.

- **8.5.1** — fixes repeated indexed-history scanning in opponent scouting and match-card weighted win percentages; bounded transient GET retry and preserve-last-good schedules/inbox; restores 12px gaps in match and standings card trains; top-right monitored-team ranking pill and match-style short Updated timestamps.

- **8.5.0** — Last-ten cross-season 11v11-weighted opponent strength and attack/defense ratings; both teams' weighted historical win percentages on league match cards; calendar reverts to static 14-day tap-to-expand; standings cards slide without gaps.

- **8.4.0** — on-demand opponent scouting with weighted quality-of-victory index, attacking/defending and history ranks, form, average goal difference, verified 8v8 versus 11v11 records, collapsed older results; eliminates standings 1/2 indicator, places update timestamps inside cards, and reduces the public-results-index freshness gate to one hour.

- **8.3.0** — moves LEAGUE STANDINGS into each tracked-team card; adds per-game attack/defense and verified previous-season ranking bars; brings match-style connected-card swipes and edge waterfall controls to the 14-day calendar; increases standings typography.

- **8.2.1** — standings now behave as a full-width match-card train with drag/swipe and waterfall edge arrows; slimmer P/W-D-L/GD/Pts table; RATS history/standings index refresh reduced from 24 to 12 hours, partial retries unchanged at 30 minutes.

- **8.2.0** — adds a current-season RATS division standings carousel per tracked team, bold/highlighted tracked rows, and tap-to-open indexed match histories. Standings are provisional from scored results, not official RATS tie-breaker order.

- **8.1.3** — centers the match-card right arrow, extends the Next Game idle reset to 15 seconds, and adds previous/next 14-day calendar paging buttons that do not expand the card.

- **8.1.2** — RSVP and capacity alerts respect a signed-in player's booking; explicit administrator deletions reconcile BallerWatch-managed RATS Google Calendar events after Apps Script bridge v6, while source outages never authorize deletion.
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
- **7.0.18** — Keeps Inbox in the browser modal top layer when returning from a notification detail, preventing it from falling behind dashboard cards.
- **7.0.19** — Fixes the pickup RSVP roster empty-state check so signed-in roster viewing no longer throws `players is not defined`.
- **7.0.20** — Replaces the ambient music loop with an original self-contained stadium-football anthem synthesized in Web Audio, with no third-party audio assets.
- **7.0.21** — Fixes installed-iPhone taps on the pickup capacity pill so the RSVP roster opens instead of the match-card swipe handler suppressing the tap.
- **7.0.22** — Gives the desktop Pickup/League pill pointer priority over the overlapping right-edge carousel navigation zone.
- **7.0.23** — Clears the lingering green capacity-pill focus ring after pointer/touch roster use while preserving keyboard focus behavior.
- **7.0.24** — Simplifies pickup match cards by turning weather into lightweight information, RSVP into a distinct rounded-rectangle action, and Directions/Share into quieter secondary controls.
- **7.0.25** — Moves RSVP into a full app-width capacity roster sheet and repairs desktop Pickup/League Edit/Delete priority over the right-edge carousel affordance.
- **7.0.26** — Restores the desktop right waterfall to the full visual card edge while keeping its clickable hit area below the Pickup/League action zone.
- **7.1.0** — Adds deterministic all-season RATS history to Ask BallerWatch, including team records, season-specific records, prior meetings, head-to-head summaries, and team season history from encrypted indexed public results.
- **7.1.1** — Repairs RATS record ingestion by parsing the source's score strings, crawling historical seasons incrementally with retries, labeling partial coverage, and improving scheduled privacy-safe answer-review diagnostics.\n- **7.1.7** — Fixes multi-megabyte encrypted RATS history restoration so archive progress and retry state persist across league runs, with explicit diagnostics for source-unavailable seasons.

- **7.1.7** — Matches FC/SC club-name shorthand in RATS records and head-to-head queries while retaining partial archive-coverage warnings.

- **7.1.7** — RATS history starts Summer 2023; singular/plural team aliases; match-type Edit hover cue; field-specific Google Maps share links; newly reported or corrected scores for monitored RATS teams appear in League notifications.

- **7.1.7** — Move chat launcher to bottom-right and share geocoded field GPS through Google Maps, never a fake city-wide pin.

- **7.1.7** — Preserve published RATS venue map links, reuse verified GPS, and fall back to Directions Google Maps lookup for sharing.

- **7.1.7** — Encrypted append-only RATS field directory; typo-tolerant but number/direction-safe lookup shared by Directions and Share, with Google Maps/GPS fallback.

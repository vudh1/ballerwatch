# BallerWatch

**Your soccer matchday in one place.** BallerWatch shows pickup RSVP availability, Seattle RATS games, field directions, weather, team standings, and match reminders in an installable web app — no account required.

**[Open Production](https://vudh1.github.io/ballerwatch/)** · **[Open Beta](https://vudh1.github.io/ballerwatch/beta/)** · **[Project documentation](docs/wiki/Home.md)**

**FRIDAY:** [Integration ownership and agent guidance](FRIDAY.md).

**v11.8.2:** Watching now renders only the currently selected match-day card while retaining the full-year date index and fixed day counter. This prevents the oversized GPU-transformed carousel that could crash iPhone Safari when advancing days. All match details, schedule jumps, swipes, device-local preferences and offline handling remain available. No backend, encrypted-state, broadcast lookup or calendar subscription changes. Production deployment remains separately gated.

**v11.8.1:** The dashboard's pull-to-rewind cue now responds consistently to gestures that cross the feed's top edge, including iPhone Safari's non-cancelable touchmove behavior. Elastic resistance is visible before a deliberate firm pull reopens the intro; normal scrolling and horizontal match swipes remain native. This is a frontend-only change with no new polling, provider calls, calendars, or account behavior.\n\n**v11.8.0:** The optional Watching match details now use 146 channel names from an October 25 user-supplied Drogon TV snapshot (138 regular, 8 TEST). Weekly ESPN indexing and daily TV refreshes precompute only explicitly published, exact network matches into the existing encrypted sports snapshot; the page makes no additional lineup or program-guide requests. Matching a broadcaster to Drogon's listed channel means **check the Drogon TV guide**, not that a particular match or stream is guaranteed. Experimental/test channels are excluded from recommendations. Existing ICS feeds, RSVP and RATS behavior are unchanged. **Production deployment is separate and not implied by merge.**

**v11.7.1:** The dashboard tabs now read **Playing** and **Watching**. Onboarding headings and the watched-team Settings label use the same short language; existing per-device selections, match cards, subscriptions and external calendar links are unchanged. This frontend-only patch requires normal validation and release promotion before appearing in production.

**v11.7.0:** On a fresh device, an optional three-step setup helps select a pickup RSVP name, followed RATS teams and professional teams to watch; every step can be skipped and later configured in Settings. RSVP names now use a searchable list from one upcoming published pickup roster with a manual option when absent. Missing preferences get a quiet Settings link. Returning devices retain their existing selections. Option A adds opt-in accountless, independently managed stable calendar links: selected Play/Watch teams can sync encrypted to a dedicated Cloudflare D1 profile without changing the saved Vela link. Each paired device gets its own management credential; recovery, revocation and deletion are supported. **This code is on a draft branch, not merged or deployed, and requires separately approved D1/key provisioning.** Existing parameter-based ICS links keep working. See [FRIDAY issue #12](https://github.com/vudh1/friday/issues/12).

**v11.6.5:** The upward rewind now has a clearly perceptible elastic boundary: a light pull stretches the entire matchday page by up to 28 px and briefly displays a compact "Pull to rewind" progress hint. A firmer continuous swipe/scroll rewinds into the soccer intro; normal card scrolling and backward movement inside the animation stay native. Rewind thresholds are higher to avoid accidental transitions. Reduced motion, Skip Intro, and offline behavior remain unchanged.

**v11.6.4:** Fix the reversible intro on repeat visits: even when the dashboard opens directly after the initial animation, a deliberate upward pull now reinstates the stadium. Light pulls show subtle elastic resistance; touch momentum is guarded on iOS. Updated calendar help explains why adding monitored teams does not modify a previously saved Vela TV `.ics` link: copy the new URL and replace Vela’s BallerWatch source; Vela currently shows only seven days of fixtures. PWA caches and regression tests updated.

**v11.6.3:** Refreshed all six cinematic feature descriptions to the latest Play/Watch, RATS scouting, RSVP, AI, inbox, device settings and Vela TV calendar capabilities. Added a deliberate upward-scroll resistance at the main-to-soccer-intro boundary: light upward gestures stop at the dashboard; a stronger continuous wheel/trackpad or touch pull rewinds the animated stadium. Regular card scrolling, Skip Intro, offline data and reduced-motion behavior are unaffected. See [current animation documentation](docs/wiki/V2.md#animation--current-production-experience-1163).

**v11.6.2:** Watch calendar dates now display both ⚽ and 🏀 when tracked soccer and basketball games share a day. The Watch carousel indexes all known match days over the existing one-year schedule horizon in advance, so its `current / total days` footer stays stable while swiping rather than growing at every 14-day boundary. Personal match tracking remains unchanged.

**v11.6.1:** **Teams to Watch** now shows exactly one daily matches card at a time in a swipeable carousel like the standings card. The schedule’s date buttons select the corresponding daily card; match rows still open details. Missing or unavailable broadcast information is omitted completely. Teams and start times always remain visible in device-local time, and published calendar subscriptions continue using timezone-aware event start times. The Play carousel remains unchanged.

**v11.6.0:** **Where to Watch** on professional match cards uses published U.S. TV listings, prioritizes the device's Prime Video and ESPN preferences, and suggests checking DrogonTV's guide for a small set of channels in its advertised lineup. Service choices remain on each device. If the broadcast is unannounced or unavailable on selected services, BallerWatch says so instead of guessing. Full fixture indexing stays weekly; near-term TV information refreshes daily from the public scoreboard without live page-load lookups. The calendar subscription also includes published U.S. channels in event descriptions. Watch matches are grouped into **one compact card per day**, with a full match-details window on tap; Play keeps its existing carousel. DrogonTV match availability is never guaranteed.

**v11.5.0:** A compact Play / Watch slider switches between separate dashboards: **Teams to play** (default) shows your own match, schedule and RATS standings cards; **Teams to watch** shows professional match cards and a separate schedule, with no RATS standings, RSVP, scouting, player editing or unrelated play actions. Swipe watch match cards just like personal fixtures. The precomputed sports index and read-only calendar subscriptions are unchanged.

**v11.4.2:** Initial sports backfill verified: 2,670 fixtures, 326 team options and zero provider failures. The Cloudflare Worker uses GitHub’s raw Contents media type to read the encrypted annual index, which exceeds the standard 1 MB Contents API response limit. iCalendar feeds are generated on each subscribed-client refresh; no `.ics` object is stored or overwritten.

**v11.4.1:** Fixed the first professional-sports index by using supported ESPN monthly scoreboard queries (with an explicit record limit), indexing up to 366 days of published fixtures. An initial index is built on integration into main; weekly indexes continue after deployment. Existing iCalendar subscription URLs are dynamically regenerated from the latest public fixtures whenever a TV/calendar client refreshes. A change to the followed-team list changes the URL, so a new link must be copied to the TV.

**v11.4.0:** Follow NBA teams, major European football clubs and UEFA/CONMEBOL national teams in a calendar-only watchlist, backed by a weekly encrypted fixture index. Export public pickup, selected RATS and watched matches as a read-only `.ics` subscription URL for Vela TV and other calendar apps. No Google Calendar login is needed; links embed the selected team names and must be copied again after changing them. Fixture coverage comes from an unofficial, best-effort source and may be incomplete when upstream listings are unavailable.

**v11.3.0:** Published pickup RSVP lists now identify confirmed or waitlisted participants who have requested to withdraw. Their pending requests stay visible in original RSVP order and do not change reserved-space totals until the external RSVP source removes the signup.

**v11.2.5:** Cross-division RATS games now count toward both teams’ own division standings, including season played/won/drawn/lost and points. Scouting uses the same results in its last-ten sample and adjusts for opponent division strength. Forecast labels and uncapped RSVP display remain as updated in v11.2.4.

**v11.2.4:** The match forecast bar shows your win, tie, then opponent-win segments; only the two teams' win percentages are labeled, using clear abbreviations such as PhoSaiGon → PSG. Pickup games without a published cap show their actual RSVP count, not an invented 16-player limit or remaining-spots meter. The 16-player default is kept **only for notifications**; a real published cap is still displayed.

## What you can do

- **Find your next match quickly.** Swipe through pickup and league match cards; open the schedule calendar for later games. Skip the optional cinematic introduction or use reduced-motion mode.
- **Check pickup spots and RSVPs.** See capacity and the published event's RSVP roster or waitlist in signup order, without signing in. Withdrawal requests are marked beside affected names, but do not cancel a signup inside BallerWatch. Only that selected, published event's display names, guest counts and pending withdrawal status are shown.
- **Get there.** Open directions, share a venue map link, and check available game-window weather.
- **Follow teams.** Choose up to eight RATS teams on your device; inspect individual standings cards, historical scores, and prepared scouting reports.
- **Watch professional sports.** Follow up to twenty NBA, top-five European league or national teams; their fixtures appear in Watching as swipeable professional match cards and a separate calendar. The separate schedule index refreshes weekly; Watch never contains RSVP or RATS standings.
- **Share your calendar.** The existing read-only `.ics` link still works without an account, but its query parameters require replacing it after team changes. The optional private calendar profile (once deployed and explicitly enabled) stores encrypted selections and uses one stable Vela TV link until deliberately rotated or revoked. Only the read-only link goes to Vela; a separate device credential authorizes changes.
- **Stay informed.** Use the in-app notification center and optional Web Push for real schedule changes and reminders.
- **Ask BallerWatch AI.** Look up indexed match facts, opponents, jersey colors and historical results. Answers are constrained by the available data.

## A short preview

![BallerWatch animated demo: cinematic matchday preview](docs/demo.gif)

*This older synthetic-data walkthrough demonstrates the app's general layout. It is not a recording of the new beta motion or current live scores.*

## Production and Beta

| | Production | Beta |
| --- | --- | --- |
| Address | [Open Production](https://vudh1.github.io/ballerwatch/) | [Open Beta](https://vudh1.github.io/ballerwatch/beta/) |
| Updates | Only after a manual release | After successful validation and publication from `main` |
| Installation | Stable Home Screen app | Separate Home Screen app with a Beta marker |
| Offline files and device settings | Production-scoped | Independently scoped for beta |

In the updated app, open **Settings → App channel** and choose Production or Beta. Switching opens the corresponding address rather than replacing the running app. Beta may change or be temporarily unavailable; if an availability check fails, the selector stays on Production. Both released environments now include the channel selector; you can also use the direct [Beta link](https://vudh1.github.io/ballerwatch/beta/).

Beta and production keep separate browser preferences, match edits, caches and service workers. Changing a date or hiding a match affects only the device and environment where you did it. Beta currently uses the stable production API for published match data; it has no independent notification writer or scheduler. Production does not advance automatically.

For details, read [Beta and cinematic app](docs/wiki/V2.md) and [Release Process](docs/wiki/Release-Process.md).

## What scouting estimates mean

The three-way **win / draw / loss** percentages are estimates based on previously indexed public match results, not predictions of certain outcomes or betting advice. Reports show the available recent scored-game sample, opponent-adjusted form and archive limitations. New teams or thin histories receive cautious, lower-reliability results.

The existing scouting evaluator replays matches in chronological order, compares an unchanged production predictor with baselines and challengers, and holds the latest completed season outside tuning. A challenger is adopted only if its held-out probability scores improve by the established safety margin. The beta also makes draw handling and confidence diagnostics clearer; no improvement is claimed without measured evidence. [Scouting methodology](docs/wiki/Scouting.md).

## Privacy and installation

BallerWatch does not require a visitor account or Google Calendar access. A shared calendar feed contains public fixture details only; the URL does not include private RSVP rosters, notification state, or user credentials. The feed address is not an authenticated, revocable private link. Your RSVP name, followed teams and local match edits remain on your device until you change them or clear site data. In-app notification messages and read/deleted state expire after 24 hours. Optional push subscriptions persist until you disable them or the provider invalidates them. Published single-event pickup RSVP rosters are available on demand; there is no public searchable participant directory. Administrator software maintenance stays protected.

To install on **Android**, open BallerWatch in Chrome or a supported browser, tap **How to install** in the app, and use the native **Install app** option when offered. You can also choose **Install app** or **Add to Home screen** from the browser menu. On **iPhone/iPad**, use Safari's **Share → Add to Home Screen**, then open the installed app before enabling Web Push. On **Windows, macOS or Linux**, use the browser's install action if available, or keep using the website without installation.

The app targets current Chromium (including Chrome and Edge), Firefox and WebKit/Safari browsers, with automated Android-size portrait/landscape and iPadOS checks. Browser tests are not a substitute for real-device certification: notification permission, Web Push, native installation and app-icon badges depend on OS/browser support. Production and Beta are separate installations. Offline mode uses previously saved frontend files and public data, not live status.

Read the [Data and Privacy guide](docs/wiki/Data-and-Privacy.md) for more details.

## For developers and maintainers

The [Card design system](docs/CARD-DESIGN-SYSTEM.md) describes the shared styling. The [project wiki](docs/wiki/Home.md) covers [architecture](docs/wiki/Architecture.md), [development](docs/wiki/Development.md), [operations](docs/wiki/Operations.md), [scouting](docs/wiki/Scouting.md) and [releases](docs/wiki/Release-Process.md).

The code is grouped under `frontend/web/` (GitHub Pages PWA), `backend/` (Cloudflare API, RATS/pickup watchers and encrypted runtime integrations), `tests/` (Node/browser regressions), and `scripts/` (validation and Pages composition). The source version and release history are in [features/versions.json](features/versions.json); live releases appear on [GitHub Releases](https://github.com/vudh1/ballerwatch/releases).

A normal change begins from the latest `main` on a feature/release branch, passes **Validate code**, and merges through review. Validated `main` is packaged into `/beta/`; the root always comes from the separate `production` ref. Production promotion is a separate explicit administrator action. Never put plaintext private runtime data into this public repository.

## License and attribution

Original BallerWatch source and documentation are offered under the [Apache License 2.0](LICENSE) (`Apache-2.0`), subject to the ownership and third-party boundaries in [COPYRIGHT.md](COPYRIGHT.md). Copyright © 2026 Duong Vu and contributors. Sports feeds, team/league logos, trademarks, media and private data are **not** relicensed by the project. BallerWatch is independently maintained within the [FRIDAY ecosystem](FRIDAY.md).

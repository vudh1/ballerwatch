# BallerWatch

**Your soccer matchday in one place.** BallerWatch shows pickup RSVP availability, Seattle RATS games, field directions, weather, team standings, and match reminders in an installable web app — no account required.

**[Open Production](https://vudh1.github.io/ballerwatch/)** · **[Open Beta](https://vudh1.github.io/ballerwatch/beta/)** · **[Project documentation](docs/wiki/Home.md)**

**v11.3.0:** Published pickup RSVP lists now identify confirmed or waitlisted participants who have requested to withdraw. Their pending requests stay visible in original RSVP order and do not change reserved-space totals until the external RSVP source removes the signup.

**v11.2.5:** Cross-division RATS games now count toward both teams’ own division standings, including season played/won/drawn/lost and points. Scouting uses the same results in its last-ten sample and adjusts for opponent division strength. Forecast labels and uncapped RSVP display remain as updated in v11.2.4.

**v11.2.4:** The match forecast bar shows your win, tie, then opponent-win segments; only the two teams' win percentages are labeled, using clear abbreviations such as PhoSaiGon → PSG. Pickup games without a published cap show their actual RSVP count, not an invented 16-player limit or remaining-spots meter. The 16-player default is kept **only for notifications**; a real published cap is still displayed.

## What you can do

- **Find your next match quickly.** Swipe through pickup and league match cards; open the schedule calendar for later games. Skip the optional cinematic introduction or use reduced-motion mode.
- **Check pickup spots and RSVPs.** See capacity and the published event's RSVP roster or waitlist in signup order, without signing in. Withdrawal requests are marked beside affected names, but do not cancel a signup inside BallerWatch. Only that selected, published event's display names, guest counts and pending withdrawal status are shown.
- **Get there.** Open directions, share a venue map link, and check available game-window weather.
- **Follow teams.** Choose up to eight RATS teams on your device; inspect individual standings cards, historical scores, and prepared scouting reports.
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

BallerWatch does not require a visitor account or Google Calendar access. Your RSVP name, followed teams and local match edits remain on your device until you change them or clear site data. In-app notification messages and read/deleted state expire after 24 hours. Optional push subscriptions persist until you disable them or the provider invalidates them. Published single-event pickup RSVP rosters are available on demand; there is no public searchable participant directory. Administrator software maintenance stays protected.

To install on **Android**, open BallerWatch in Chrome or a supported browser, tap **How to install** in the app, and use the native **Install app** option when offered. You can also choose **Install app** or **Add to Home screen** from the browser menu. On **iPhone/iPad**, use Safari's **Share → Add to Home Screen**, then open the installed app before enabling Web Push. On **Windows, macOS or Linux**, use the browser's install action if available, or keep using the website without installation.

The app targets current Chromium (including Chrome and Edge), Firefox and WebKit/Safari browsers, with automated Android-size portrait/landscape and iPadOS checks. Browser tests are not a substitute for real-device certification: notification permission, Web Push, native installation and app-icon badges depend on OS/browser support. Production and Beta are separate installations. Offline mode uses previously saved frontend files and public data, not live status.

Read the [Data and Privacy guide](docs/wiki/Data-and-Privacy.md) for more details.

## For developers and maintainers

The [Card design system](docs/CARD-DESIGN-SYSTEM.md) describes the shared styling. The [project wiki](docs/wiki/Home.md) covers [architecture](docs/wiki/Architecture.md), [development](docs/wiki/Development.md), [operations](docs/wiki/Operations.md), [scouting](docs/wiki/Scouting.md) and [releases](docs/wiki/Release-Process.md).

The code is grouped under `frontend/web/` (GitHub Pages PWA), `backend/` (Cloudflare API, RATS/pickup watchers and encrypted runtime integrations), `tests/` (Node/browser regressions), and `scripts/` (validation and Pages composition). The source version and release history are in [features/versions.json](features/versions.json); live releases appear on [GitHub Releases](https://github.com/vudh1/ballerwatch/releases).

A normal change begins from the latest `main` on a feature/release branch, passes **Validate code**, and merges through review. Validated `main` is packaged into `/beta/`; the root always comes from the separate `production` ref. Production promotion is a separate explicit administrator action. Never put plaintext private runtime data into this public repository.

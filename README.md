# BallerWatch

**Your soccer matchday in one place.** BallerWatch shows pickup RSVP availability, Seattle RATS games, field directions, weather, team standings, and match reminders in an installable web app — no account required.

**[Open Production](https://vudh1.github.io/ballerwatch/)** · **[Open Beta](https://vudh1.github.io/ballerwatch/beta/)** · **[Project documentation](docs/wiki/Home.md)**

Production is the stable, manually released app. Beta previews validated changes before they are promoted. The code currently in development is **v11.2.0**; that does **not** mean production has been upgraded.

## What you can do

- **Find your next match quickly.** Swipe through pickup and league match cards; open the schedule calendar for later games. Skip the optional cinematic introduction or use reduced-motion mode.
- **Check pickup spots and RSVPs.** See capacity and the published event's RSVP roster or waitlist in signup order, without signing in. Only that selected, published event's display names and guest counts are shown.
- **Get there.** Open directions, share a venue map link, and check available game-window weather.
- **Follow teams.** Choose up to eight RATS teams on your device; inspect individual standings cards, historical scores, and prepared scouting reports.
- **Stay informed.** Use the in-app notification center and optional Web Push for real schedule changes and reminders.
- **Ask BallerWatch AI.** Look up indexed match facts, opponents, jersey colors and historical results. Answers are constrained by the available data.

## A short preview

![BallerWatch cinematic matchday demo](docs/demo.gif)

*This older synthetic-data walkthrough demonstrates the app's general layout. It is not a recording of the new beta motion or current live scores.*

## Production and Beta

| | Production | Beta |
| --- | --- | --- |
| Address | [Open Production](https://vudh1.github.io/ballerwatch/) | [Open Beta](https://vudh1.github.io/ballerwatch/beta/) |
| Updates | Only after a manual release | After successful validation and publication from `main` |
| Installation | Stable Home Screen app | Separate Home Screen app with a Beta marker |
| Offline files and device settings | Production-scoped | Independently scoped for beta |

In the updated app, open **Settings → App channel** and choose Production or Beta. Switching opens the corresponding address rather than replacing the running app. Beta may change or be temporarily unavailable; if an availability check fails, the selector stays on Production. The production site cannot show this new setting until a future manual production release, so you can always use the direct [Beta link](https://vudh1.github.io/ballerwatch/beta/) meanwhile.

Beta and production keep separate browser preferences, match edits, caches and service workers. Changing a date or hiding a match affects only the device and environment where you did it. Beta currently uses the stable production API for published match data; it has no independent notification writer or scheduler. Production does not advance automatically.

For details, read [Beta and cinematic app](docs/wiki/V2.md) and [Release Process](docs/wiki/Release-Process.md).

## What scouting estimates mean

The three-way **win / draw / loss** percentages are estimates based on previously indexed public match results, not predictions of certain outcomes or betting advice. Reports show the available recent scored-game sample, opponent-adjusted form and archive limitations. New teams or thin histories receive cautious, lower-reliability results.

The existing scouting evaluator replays matches in chronological order, compares an unchanged production predictor with baselines and challengers, and holds the latest completed season outside tuning. A challenger is adopted only if its held-out probability scores improve by the established safety margin. The beta also makes draw handling and confidence diagnostics clearer; no improvement is claimed without measured evidence. [Scouting methodology](docs/wiki/Scouting.md).

## Privacy and installation

BallerWatch does not require a visitor account or Google Calendar access. Your RSVP name, followed teams and local match edits remain on your device until you change them or clear site data. In-app notification messages and read/deleted state expire after 24 hours. Optional push subscriptions persist until you disable them or the provider invalidates them. Published single-event pickup RSVP rosters are available on demand; there is no public searchable participant directory. Administrator software maintenance stays protected.

To install on iPhone, open the site in Safari, tap **Share → Add to Home Screen**. On supported desktop and Android browsers, use **Install app** in the browser menu. Add Beta separately if you want to test it without replacing the stable app. Offline mode shows previously saved frontend files and compatible cached public data, not live status.

Read the [Data and Privacy guide](docs/wiki/Data-and-Privacy.md) for more details.

## For developers and maintainers

The [project wiki](docs/wiki/Home.md) covers [architecture](docs/wiki/Architecture.md), [development](docs/wiki/Development.md), [operations](docs/wiki/Operations.md), [scouting](docs/wiki/Scouting.md) and [releases](docs/wiki/Release-Process.md).

The code is grouped under `frontend/web/` (GitHub Pages PWA), `backend/` (Cloudflare API, RATS/pickup watchers and encrypted runtime integrations), `tests/` (Node/browser regressions), and `scripts/` (validation and Pages composition). The source version and release history are in [features/versions.json](features/versions.json); live releases appear on [GitHub Releases](https://github.com/vudh1/ballerwatch/releases).

A normal change begins from the latest `main` on a feature/release branch, passes **Validate code**, and merges through review. Validated `main` is packaged into `/beta/`; the root always comes from the separate `production` ref. Production promotion is a separate explicit administrator action. Never put plaintext private runtime data into this public repository.

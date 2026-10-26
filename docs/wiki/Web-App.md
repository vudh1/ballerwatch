# Web App

The installable PWA is BallerWatch's sole user surface.

The website works without a visitor account. RSVP rosters for an individual published pickup event are readable without sign-in; RSVP names, monitored teams, match edits and notification choices stay on each browser installation. Administrator software maintenance remains password-protected.

## Watching across competitions (11.11.0)

Watching uses the existing encrypted professional fixture index. The weekly annual sweep now queries the five major European domestic leagues, UEFA Champions League, UEFA Europa League, UEFA Nations League and other supported national competitions; the daily broadcast-only sweep uses those same codes. Team selections are still stored per device (or in an explicitly opted-in stable calendar profile). Selecting a domestic club shows its indexed European cup games as well, provided ESPN identifies that club by the same normalized display name. Clubs with a different published alias may need their European competition option selected separately. A matching league does not imply that an unpublished fixture or broadcaster is known.

Each Watching match shows the indexed **competition** in its day row and details. The subscribed ICS feed also uses `Competition · Home vs Away` as the title and `Competition: ...` in its description, including UEFA Nations League. Existing read-only ICS URLs, event UIDs, calendar times, Vela subscription refreshes and cancellation behavior are unchanged. This is public fixture metadata only: no roster, account, team-private setting or encrypted state is shared with Vela. No new page-load provider call, Web Push or billed service is introduced.

## First-device setup (11.7.0 preview)

New installations are offered three optional choices after the soccer introduction: pickup RSVP name, teams to play in RATS, and professional teams to watch. Every step can be skipped; the small Play/Watch empty-preference note points directly to Settings. Only installations without established local preferences or public cache receive this first-visit prompt, so current users are not unexpectedly interrupted. Beta and production retain separate setup markers. The wizard remains dismissible if a visitor does not want to configure anything.

The RSVP name field in Settings is a searchable single-selection dropdown. Options come from **one next publicly published pickup roster**, requested on demand through the existing date-scoped endpoint. No cross-date directory or source roster is retained, and someone absent from the list can type and add their own name. An explicit clear button removes an earlier selection. Device preferences do not sync without separate, future consent and authorization.

**Option A calendar profiles (v11.7.0 feature branch):** the Settings → Share my sports calendar section supports explicit opt-in for a stable opaque ICS subscription URL. Encrypted team choices and pickup inclusion live in a dedicated Cloudflare D1 profile; BallerWatch keeps working locally if the service is unavailable. Each linked device must redeem a short-lived, explicitly generated pairing code to receive its own management credential. Recovery codes are one-time and replaceable; authorized users can disconnect devices, revoke other devices, rotate the read-only URL or delete the profile. The legacy query-based ICS link is preserved. Vela TV stores only the read-only URL under its own encrypted display-profile calendar; it never has the management credential. This capability is **implemented on a draft branch, not deployed or provisioned**; without D1 and a separate encryption key, the feature remains unavailable. See [Calendar Profile Contract](Calendar-Profile-Contract.md) and [FRIDAY issue #12](https://github.com/vudh1/friday/issues/12).

## App hub

The badged AI icon opens three connected sections: **AI / Settings / Notifications**. It fades in with the main app and remains available while reading cards, without detached header controls. Switching sections preserves the existing account/Q&A/Inbox controllers.

## Settings

Every visitor can change their RSVP display name, up to eight monitored RATS league teams, local match edits and notification choices without an account. These preferences persist on that device until the visitor changes them or clears the browser's site data. Only notification-center messages/read state expire after 24 hours. Maintenance credentials and release actions are restricted to the protected administrator section.

## Match-card action hierarchy

Pickup match cards deliberately avoid using the same capsule treatment for every element. The Pickup/League type remains a compact tag, weather is shown as lightweight informational text, the capacity area is the single entry point for roster/RSVP, and Directions/Share are quieter secondary controls. The RSVP action lives inside the roster sheet, stays neutral until authenticated confirmation is known, and uses the green success treatment with a check only when confirmed.

## Pickup RSVP roster

For published RSVP-enabled pickup matches, the capacity area opens a full app-width roster sheet **without a user account**. The sheet shows that game's confirmed display names, guest counts and waitlist in RSVP order. Any source-marked withdrawal request is shown beside that participant in either list, with a request count in the roster summary. The request does not free the spot until the external RSVP source removes it. The external RSVP action stays in the sticky footer. The API returns only an individual published game's roster on request; private name catalogs are not exposed. On touch devices, including the installed iPhone PWA, match-card swipe navigation excludes links, buttons, ARIA buttons, and form controls so a normal tap on capacity is not consumed by the swipe gesture.

On desktop pointer devices, the final right-edge carousel hit area starts below the full Pickup/League Edit/Delete trigger zone. Hovering or clicking that match-type action therefore takes priority over moving to the next match.

The visual waterfall is independent from that hit area: its blur/glow still spans the full right edge of the match card. Only the interactive next-match hit target is shortened, so the card edge looks continuous without covering the match-type action.

When the RSVP roster is opened by mouse or touch, closing it clears the temporary capacity-pill focus state so the green focus outline does not linger. Keyboard-opened rosters retain focus for accessibility.

For published RSVP pickup dates, BallerWatch uses **16 spots as the fallback capacity** when the source leaves the cap blank or unspecified. A valid positive cap from the source always takes precedence. Match cards, the roster sheet, AI capacity answers and notifications use the same effective value; the 16-slot default yields capacity milestones at 4, 8, 12 and then every additional signup through 16. This is an app display/alert default, not a change to the external RSVP service's admission rules. Free pickup games without RSVP remain uncapped and have no roster.

## Cached RATS venue directions and sharing

Directions and Share use the same venue resolution. First they look for a confidently matched name in the encrypted, append-only `league/state/venues.json` directory, populated by live monitored league fixtures and historical aggregate scans. Only URLs explicitly published in RATS event fields/notes (or other validated public venue URLs) are cached; a synthesized search result is never mistaken for a verified published link. New location names are added automatically; a stored destination is never overwritten, though an unresolved entry may receive its first verified URL or coordinates.

The matcher normalizes punctuation, soccer/playfield suffixes, and minor misspellings while preserving numbered-field and directional distinctions. Ambiguous matches are discarded. If no verified source destination exists, the frontend falls back to field-specific GPS from the existing geocoder or Google Maps search; it never treats Google Maps viewport coordinates as a known field GPS point.

Venue directory state is encrypted on the dedicated runtime-state branch, included in encryption audits and failover backups, and cached in the Worker for at most ten minutes. The cache has no scheduled recrawl/update for existing confirmed links. Site venue pages that render only in JavaScript are not assumed to contain exact GPS coordinates.

## RATS historical Q&A

Ask BallerWatch can answer deterministic questions about public Seattle RATS history, including a team's all-time record, a record in a named season, whether two teams have met before, head-to-head summaries with recent scored meetings, and which indexed seasons a team appeared in.

The historical index is built from the same public RATS seasonal aggregate source used by the league watcher. Published scores arrive as compact strings such as `4-0`; BallerWatch parses those into home/away results before calculating records. Archive discovery runs in small persistent batches across normal league refreshes so transient source timeouts or 502s do not collapse the whole index. While coverage is incomplete, the bot labels the result as partial and never presents it as an all-time record.

The bot keeps up to two matched historical team names in session context so a follow-up such as “what is their record?” can continue the previous history question without storing that conversational context as durable public data.

## Q&A and feedback

Read-only Q&A is served through the Worker. Successful answers receive a short-lived feedback token scoped to that exact question/answer. Marking an answer wrong does not grant Settings access.

Privacy-safe engineering review now distinguishes RATS historical-record, head-to-head, and season-history failures without copying team names or raw questions into the review projection. The safe summary workflow runs on a six-hour cadence.

## Web Push

The hub’s Notifications section controls subscription state. Registration uses a short-lived endpoint-bound challenge and recognized push-provider policy. Notification navigation is constrained to the BallerWatch Pages origin/path.

Inbox and notification details both use modal top-layer dialogs. Returning from a notification detail reopens Inbox as a modal, so the notification surface remains above dashboard cards until the user closes it.

## Launch experience

On a fresh site/app session, the cinematic launch overlay is selected before the browser's first paint so the dashboard cannot flash underneath it. A two-second brand launch leads to the native-scroll soccer tour and original cards. Skip jumps to the real card reveal, so scrolling up can rewind during that document’s lifetime. Subsequent session entries and reduced motion may enter directly. See [Cinematic app](V2).

Scouting reports and forecast challengers are prepared in bounded background jobs; see [Scouting and forecasts](Scouting).

## Music

The optional Settings speaker control plays an original stadium-football anthem synthesized locally with the browser Web Audio API. The arrangement uses synthesized kick percussion, clap texture, bass, brass-like chord stabs, and an original celebratory hook. BallerWatch does not download, stream, or bundle third-party music files for this feature.

The preference remains local to the device. Playback starts only after a browser-permitted user gesture and pauses when the app is no longer visible.

## Live status

The Live indicator is shown only when runtime-backed config, game/calendar data, and notification-board reads succeed. A healthy static shell with unavailable runtime data must display Offline.

## Installation and supported browsers

- **Android (Chrome/Chromium):** open the site, choose **How to install** and use the native **Install app** button if offered, or select **Install app / Add to Home screen** from the browser menu. Firefox or other Android browsers may offer a different menu and have different push support.
- **iPhone/iPad (Safari):** use **Share → Add to Home Screen**, launch from the new icon, then open **AI icon → Notifications**. iPadOS may use a desktop-looking user agent; BallerWatch still shows Apple instructions.
- **Desktop (Windows/macOS/Linux):** use the browser installation action where supported. BallerWatch remains usable as a regular tab without installation.

The PWA exposes a manifest, an offline service-worker shell and browser-appropriate install help. Web Push, notification permissions and app-icon badges are optional and controlled by the browser and OS. A browser without Web Push keeps the public match and calendar features usable, with unsupported push controls disabled. Device preferences and service-worker caches stay isolated across Production, Beta and legacy V2 installs during updates.

Continuous integration tests Chromium, Firefox and WebKit with synthetic API data, Android mobile/landscape viewports, iPhone/iPad emulation, PWA upgrade/cache safety and offline routes. These are simulated browser checks, not claims of hands-on physical device testing.

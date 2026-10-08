# Web App

The installable PWA is BallerWatch's sole user surface.

Anonymous use is public-safe/read-only. Private Settings uses user-password authentication.

## Settings

A signed-in user can change:
- pickup RSVP display name;
- monitored RATS league teams;
- user password;
- global session revocation.

There is no in-app pairing-code recovery path. First-time bootstrap or forgotten-password recovery is administrator-controlled through **Reset web user password** with a temporary `BALLERWATCH_RECOVERY_PASSWORD` Actions secret.

## Match-card action hierarchy

Pickup match cards deliberately avoid using the same capsule treatment for every element. The Pickup/League type remains a compact tag, weather is shown as lightweight informational text, the capacity area is the single entry point for roster/RSVP, and Directions/Share are quieter secondary controls. The RSVP action lives inside the roster sheet, stays neutral until authenticated confirmation is known, and uses the green success treatment with a check only when confirmed.

## Pickup RSVP roster

For RSVP-enabled pickup matches, the capacity area opens a full app-width roster sheet. The sheet shows the signed-in RSVP roster and keeps the external RSVP action in a sticky footer, so the match card does not need a separate RSVP button. On touch devices, including the installed iPhone PWA, match-card swipe navigation excludes links, buttons, ARIA buttons, and form controls so a normal tap on capacity is not consumed by the swipe gesture.

On desktop pointer devices, the final right-edge carousel hit area starts below the full Pickup/League Edit/Delete trigger zone. Hovering or clicking that match-type action therefore takes priority over moving to the next match.

The visual waterfall is independent from that hit area: its blur/glow still spans the full right edge of the match card. Only the interactive next-match hit target is shortened, so the card edge looks continuous without covering the match-type action.

When the RSVP roster is opened by mouse or touch, closing it clears the temporary capacity-pill focus state so the green focus outline does not linger. Keyboard-opened rosters retain focus for accessibility.

## RATS historical Q&A

Ask BallerWatch can answer deterministic questions about public Seattle RATS history, including a team's all-time record, a record in a named season, whether two teams have met before, head-to-head summaries with recent scored meetings, and which indexed seasons a team appeared in.

The historical index is built from the same public RATS seasonal aggregate source used by the league watcher. Published scores arrive as compact strings such as `4-0`; BallerWatch parses those into home/away results before calculating records. Archive discovery runs in small persistent batches across normal league refreshes so transient source timeouts or 502s do not collapse the whole index. While coverage is incomplete, the bot labels the result as partial and never presents it as an all-time record.

The bot keeps up to two matched historical team names in session context so a follow-up such as “what is their record?” can continue the previous history question without storing that conversational context as durable public data.

## Q&A and feedback

Read-only Q&A is served through the Worker. Successful answers receive a short-lived feedback token scoped to that exact question/answer. Marking an answer wrong does not grant Settings access.

Privacy-safe engineering review now distinguishes RATS historical-record, head-to-head, and season-history failures without copying team names or raw questions into the review projection. The safe summary workflow runs on a six-hour cadence.

## Web Push

The notification bell controls subscription state. Registration uses a short-lived endpoint-bound challenge and recognized push-provider policy. Notification navigation is constrained to the BallerWatch Pages origin/path.

Inbox and notification details both use modal top-layer dialogs. Returning from a notification detail reopens Inbox as a modal, so the notification surface remains above dashboard cards until the user closes it.

## Launch experience

On a fresh site/app session, the cinematic launch overlay is selected before the browser's first paint so the dashboard cannot flash underneath it. The intro remains once-per-session and is skipped when the device requests reduced motion.

## Music

The optional Settings speaker control plays an original stadium-football anthem synthesized locally with the browser Web Audio API. The arrangement uses synthesized kick percussion, clap texture, bass, brass-like chord stabs, and an original celebratory hook. BallerWatch does not download, stream, or bundle third-party music files for this feature.

The preference remains local to the device. Playback starts only after a browser-permitted user gesture and pauses when the app is no longer visible.

## Live status

The Live indicator is shown only when runtime-backed config, game/calendar data, and notification-board reads succeed. A healthy static shell with unavailable runtime data must display Offline.

## Installation

On iPhone, open the site in Safari, choose **Add to Home Screen**, then open the installed app and enable Push notifications from the bell panel.

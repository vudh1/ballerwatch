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

## Pickup RSVP roster

For RSVP-enabled pickup matches, the capacity pill is an interactive control that opens the signed-in RSVP roster. On touch devices, including the installed iPhone PWA, match-card swipe navigation excludes links, buttons, ARIA buttons, and form controls so a normal tap on the capacity pill is not consumed by the swipe gesture.

On desktop pointer devices, the right-edge carousel navigation reserves the top-right match-type area for the Pickup/League pill. Hovering or clicking the pill therefore takes priority over moving to the next match.

## Q&A and feedback

Read-only Q&A is served through the Worker. Successful answers receive a short-lived feedback token scoped to that exact question/answer. Marking an answer wrong does not grant Settings access.

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

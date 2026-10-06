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

## Q&A and feedback

Read-only Q&A is served through the Worker. Successful answers receive a short-lived feedback token scoped to that exact question/answer. Marking an answer wrong does not grant Settings access.

## Web Push

The notification bell controls subscription state. Registration uses a short-lived endpoint-bound challenge and recognized push-provider policy. Notification navigation is constrained to the BallerWatch Pages origin/path.

Inbox and notification details both use modal top-layer dialogs. Returning from a notification detail reopens Inbox as a modal, so the notification surface remains above dashboard cards until the user closes it.

## Launch experience

On a fresh site/app session, the cinematic launch overlay is selected before the browser's first paint so the dashboard cannot flash underneath it. The intro remains once-per-session and is skipped when the device requests reduced motion.

## Live status

The Live indicator is shown only when runtime-backed config, game/calendar data, and notification-board reads succeed. A healthy static shell with unavailable runtime data must display Offline.

## Installation

On iPhone, open the site in Safari, choose **Add to Home Screen**, then open the installed app and enable Push notifications from the bell panel.

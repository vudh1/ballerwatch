# Web App, User Settings, and Push

The installable PWA is BallerWatch's primary user surface. Anonymous use is public-safe/read-only; Settings uses app-native user authentication; Web Push works independently of Telegram.

## Dashboard

The dashboard provides:

- next/selected game spotlight;
- pickup RSVP progress;
- field directions and native sharing;
- match-window weather;
- 14-day pickup/RATS calendar;
- notification inbox and Push toggle;
- one-question/one-answer Ask BallerWatch;
- user Settings.

The UI intentionally avoids a persistent chat transcript. Each new question replaces the prior answer.

## Match-card navigation

Touch devices use the connected-card swipe carousel.

On fine-pointer desktop browsers, the left/right portions of the match card are broad transparent hit zones. Moving the pointer into an available edge softly blurs/lights the edge and reveals a borderless arrow; one click runs the same connected-card train transition as a swipe. Empty dates are skipped.

## Installed iPhone behavior

The PWA uses `viewport-fit=cover` and `black-translucent` so the dashboard can feel native.

In standalone mode, a fixed blurred **status-area glass** layer sits between scrolling app content and iOS's Dynamic Island/network/battery area. It uses the safe-area inset, does not intercept touches, and fades into the dashboard below.

Install with Safari → Share → **Add to Home Screen**. iPhone Web Push requires opening BallerWatch from that Home Screen icon.

## User authentication and Settings

After bootstrap, the normal flow is:

1. open **Settings**;
2. enter the user password;
3. receive a signed capability token stored on that device;
4. edit the pickup RSVP display name or monitored league teams.

The token is valid for up to 90 days and grants only the narrow Settings capability.

The password itself is never stored. BallerWatch stores a random salt plus a server-keyed verifier inside encrypted runtime state.

Current app API routes are:

- `POST /web/user/login`
- `GET|POST /web/user/settings`
- `POST /web/user/password`
- `POST /web/user/pair`

Pre-5.8 aliases/tokens remain accepted internally during migration so installed devices are not broken by the terminology change.

### Pairing/recovery

`/webpair` is no longer normal day-to-day sign-in. While Telegram is configured, it is a bootstrap/recovery root:

1. request `/webpair`;
2. enter the six-digit code under **Use a pairing code instead**;
3. the same code can authorize multiple devices until its 10-minute expiry;
4. set/rotate the user password for normal future sign-in.

A future passkey/identity-provider flow can replace this recovery dependency without changing the Settings capability boundary.

## Wrong-answer feedback

Every successful web answer receives a short-lived signed feedback token bound to that exact question/answer.

The **Wrong answer** button (and desktop double-click shortcut) can retain that exact exchange for engineering review without signing in. It cannot read/change Settings.

On mobile, long-press text selection/copy is disabled on the answer surface, while pinch zoom remains available for the page.

If feedback authorization expires, BallerWatch asks the user to ask the question again rather than opening Settings/pairing.

## Ask autocomplete

Suggestions are an absolutely positioned glass overlay under the input. They float above the Ask card rather than increasing the form row height.

Keyboard users can navigate suggestions with arrow keys, Tab/right-arrow completion, Enter, and Escape.

## Privacy

Anonymous PWA data excludes:

- RSVP participant/waitlist names;
- user-specific RSVP status;
- private settings;
- push endpoints/keys;
- tokens/IDs;
- encrypted runtime payloads.

Exact authenticated Q&A or an anonymously rejected answer may be retained encrypted for at most 48 hours. The sanitized engineering projection is also encrypted at rest.

Every canonical `runtime-state` file is a complete AES-GCM envelope in 5.8. Public projections are decrypted and schema-checked only inside the Worker before response.

## Push architecture

1. the service worker registers from the installed PWA;
2. BallerWatch creates/loads its VAPID identity;
3. browser subscriptions are persisted inside encrypted runtime state;
4. pickup/league/version producers create only allowlisted public-safe board entries;
5. GitHub Actions signals browser push services directly;
6. the service worker fetches the newest board entry from the Worker;
7. if that read fails, the notification falls back to generic BallerWatch text.

Telegram is not in this delivery chain.

## Notifications

The bell popup keeps per-device read/delete state local to the browser. Opening an item uses the full-screen reader. Swipe-to-delete is local; **Delete all** does not delete server history.

The Push switch reflects the actual browser subscription. If the VAPID application key changes (for example after a factory reset), the PWA drops the stale subscription and asks for a new one.

## Weather

Weather is calculated for the actual game window. BallerWatch reports the maximum overlapping hourly rain probability plus match-window temperature/condition.

The encrypted 14-day snapshot refreshes every six hours and immediately after schedule-relevant pickup/league changes. RSVP-only changes do not trigger weather work.

## Release refresh

Static JS/CSS URLs carry the product version. The service worker uses `updateViaCache: "none"` and network reads use `cache: "no-store"` before updating the offline shell.

When a new service worker takes control, the app reloads once after initial hydration so an installed Home Screen app moves to the promoted release without interrupting first load.

## Live refresh

While visible, the PWA refreshes live soccer/notification data every minute and checks for a new app release periodically. Returning to a visible tab also refreshes data/update state.

The live indicator represents successful refresh, not a promise that every external provider is healthy.

# Data and Privacy

## Runtime-state invariant

Every canonical file on `runtime-state` is a complete hardened AES-GCM envelope. No readable runtime JSON, rosters, settings, push endpoints, identifiers, timestamps, chat text, or secrets may be committed to that branch.

Canonical user settings live in encrypted `state/user.json`. The 6.0 deployment migrates the previous encrypted user-state filename into this path and compacts the old filename away.

Other encrypted state includes pickup/league snapshots, the public-results RATS history index, monitored teams, Calendar reconciliation, weather/geocoding cache, watchdog state, Web Push VAPID/subscriptions, notification-board state, retained Q&A/review signals, and feature-request state.

## Q&A retention

Exact question/answer text is retained for at most 48 hours only when the exchange is user-authenticated or when an anonymous visitor explicitly marks the answer wrong. Engineering review signals are privacy-minimized and encrypted as well.

## Web Push

Push endpoints are outbound-network capabilities. Registration requires a recognized provider, HTTPS, normal port, no userinfo, no IP literal, an endpoint-bound challenge, and rate limiting. Delivery repeats validation, rejects unsafe DNS results, and disables redirects.

## User authentication

Only a signed-in user may read or change the limited Settings surface. Password verifiers are server-keyed; plaintext passwords are never persisted. Capability tokens include a server-side auth revision and expire after at most 90 days.

Recovery uses the manual **Reset web user password** workflow. The temporary recovery password is supplied through an Actions secret and must be deleted/rotated after use.

## Public projections

Public PWA/API responses and notification-board entries must never expose RSVP/waitlist names, private settings, tokens, secrets, or user-specific status.

## Device-local retention (11.0.1)

RSVP name, monitored teams and match-card corrections/hides are stored only on the browser installation, without a fixed expiration. The user can replace them in Settings or the match-card menu; clearing site data also clears them. Notification board messages, read/deleted state and device badges expire after 24 hours. Notification category choices and validated Web Push registrations persist until changed, disabled or provider-expired. Shared RATS/RSVP data stays canonical for other visitors; private HMAC RSVP indices remain encrypted.

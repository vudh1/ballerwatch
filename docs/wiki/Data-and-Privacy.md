# Data and privacy

BallerWatch treats the public source repository, the generated runtime branch, and public API responses as three different trust boundaries.

## Runtime branch

Generated state lives on the dedicated `runtime-state` branch.

Starting with 5.8, **every canonical file on that branch is a complete AES-256-GCM envelope**. There are no intentionally readable runtime files. This includes already-sanitized projections and operational metadata.

Encrypted runtime data includes:

- user/listener settings and the update cursor;
- pickup and league snapshots;
- monitored teams and Calendar reconciliation state;
- watchdog state;
- match-weather/geocode cache;
- Web Push VAPID private material and subscriptions;
- notification-board state;
- exact short-lived Q&A history;
- sanitized engineering-review signals;
- private feature requests and their aggregate summary.

`shared/runtime-state.mjs` migrates legacy partial/plain formats, refuses to push a canonical file that is not encrypted, and can audit the entire branch with:

```bash
node shared/runtime-state.mjs audit
```

Worker deployment runs the migration/audit, and the six-hour watchdog repeats the audit.

## 48-hour answer review

`state/chat-history.json` retains the original question and original answer for at most 48 hours only when:

- the exchange came from a user-authenticated surface; or
- an anonymous web visitor explicitly marks that answer **Wrong answer**.

Groq may add classification, summary, and reason metadata for engineering triage. Generated metadata never replaces the retained source exchange.

`state/chat-review.json` contains only privacy-minimized engineering signals:

- timestamp;
- `bug_candidate`, `feature_candidate`, or `negative_feedback`;
- short sanitized summary;
- short sanitized reason.

The review projection is still encrypted at rest. It must never contain names, IDs, tokens, URLs, exact addresses, raw questions, raw replies, or quotes.

Anonymous public-web Q&A is not retained by default.

## Public web surface

The anonymous PWA is read-only. Public responses may expose only data needed for the soccer experience, such as:

- published game date/time;
- public venue/field;
- aggregate RSVP count/capacity;
- monitored team schedules;
- public-safe weather;
- public-safe notification text.

It must not expose participant/waitlist names, user-specific RSVP status, push endpoints/keys, tokens, Calendar IDs, private settings, or encrypted runtime payloads.

Some public endpoints are produced from encrypted runtime projections. The Worker decrypts the branch copy in memory, validates the allowlisted schema, and returns only the permitted projection.

## User settings

Private user settings are never exposed to anonymous visitors. A signed device capability can access only the narrow Settings API for:

- pickup RSVP display name;
- monitored league teams.

Normal access uses the user password. `/webpair` is a temporary bootstrap/recovery path while Telegram remains configured. The six-digit code is stored only as a hash inside encrypted listener state and expires after 10 minutes.

The password itself is never stored. BallerWatch stores a random salt and a server-keyed verifier inside encrypted runtime state.

## Match weather

`state/weather.json` is encrypted on `runtime-state`. It may contain published game dates/times, public venue names or addresses, cached coordinates, and forecast summaries. It must not contain roster/user-private data.

## Web Push

VAPID private material and browser `PushSubscription` objects are stored only inside encrypted `state/web-push.json`.

Public notification-board responses are derived from encrypted branch state and must pass the same public-safe boundary as other PWA responses.

## Temporary plaintext

A GitHub runner or one Cloudflare Worker invocation may temporarily hold decrypted data while performing authorized work. Runtime files are removed from runners after use. Tests use synthetic/encrypted fixtures and must not publish decrypted artifacts.

## Purge

**Purge current data** first removes BallerWatch-managed RATS Calendar events, then clears generated files from `runtime-state`, including Web Push identity/subscriptions, notification boards, user settings, chat history/review, and custom monitored-team state.

It does not delete source code, repository/Worker secrets, or unrelated Google Calendar events.

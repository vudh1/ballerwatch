# Data and privacy

The public `main` branch contains source code, documentation, static configuration, tests, and release history. Generated runtime data must not be committed to `main`.

## Runtime branch

Generated state lives on the dedicated `runtime-state` branch.

Private runtime payloads are AES-GCM encrypted before storage, including listener settings, soccer snapshots, monitored-team state, Calendar reconciliation state, watchdog state, Web Push VAPID private material/subscriptions, notification-board state, explicit private feature requests, and condensed Telegram history.

## 48-hour chat history

`state/chat-history.json` stores only Groq-condensed conversation records and is encrypted. Records are retained for at most 48 hours.

`state/chat-review.json` is intentionally readable so a scheduled ChatGPT maintenance task can inspect it. It may contain only privacy-minimized engineering signals:

- timestamp;
- `bug_candidate`, `feature_candidate`, or `negative_feedback`;
- short sanitized summary;
- short sanitized reason.

It must not contain raw questions/replies, names, IDs, tokens, URLs, exact addresses, or quotations.

## Public web surface

The GitHub Pages PWA is public, so its API projection is intentionally narrower than the private Telegram bot.

The PWA may expose published soccer facts such as pickup count/capacity, date/time, field/location, RATS team/opponent/jerseys, and BallerWatch release summaries.

It must not expose RSVP participant names, waitlist names, owner-specific RSVP status, push endpoints/keys, tokens, Calendar IDs, private settings, or encrypted runtime payloads.

The Cloudflare Worker strips pickup roster and owner-specific state before answering PWA questions. Notification-board files remain encrypted at rest and only their public-safe projection is returned.

## Web Push privacy

VAPID private material and browser PushSubscription objects are stored only inside encrypted `state/web-push.json` on `runtime-state`.

Push delivery uses payload-free signals. Notification content is fetched from the public-safe notification board by the service worker, so private roster data is never embedded in push payloads.

## Temporary plaintext

Plaintext private data may exist temporarily inside an authenticated Worker invocation or ephemeral GitHub Actions runner. Workflows clean local runtime paths after use.

Encrypted GitHub Actions cache backups may retain last-known runtime state for outage recovery.

## Purge

A manual purge first removes BallerWatch-managed RATS Calendar events and then removes generated runtime files from the `runtime-state` branch, including Web Push subscriptions/VAPID state, notification boards, the 48-hour chat history/review, and custom runtime configuration. It does not delete source code, repository/Worker secrets, or unrelated Google Calendar events.

# Data and privacy

The public `main` branch contains source code, documentation, static configuration, tests, and release history. Generated runtime data must not be committed to `main`.

## Runtime branch

Generated state lives on the dedicated `runtime-state` branch.

Private runtime payloads are AES-GCM encrypted before storage, including listener settings, soccer snapshots, monitored-team state, Calendar reconciliation state, watchdog state, explicit private feature requests, and condensed Telegram history.

## 48-hour chat history

`state/chat-history.json` stores only Groq-condensed conversation records and is encrypted. Records are retained for at most 48 hours.

`state/chat-review.json` is intentionally readable so a scheduled ChatGPT maintenance task can inspect it. It may contain only privacy-minimized engineering signals:

- timestamp;
- `bug_candidate`, `feature_candidate`, or `negative_feedback`;
- short sanitized summary;
- short sanitized reason.

It must not contain raw questions/replies, names, IDs, tokens, URLs, exact addresses, or quotations.

## Temporary plaintext

Plaintext private data may exist temporarily inside an authenticated Worker invocation or ephemeral GitHub Actions runner. Workflows clean local runtime paths after use.

Encrypted GitHub Actions cache backups may retain last-known runtime state for outage recovery.

## Purge

A manual purge removes generated runtime files from the `runtime-state` branch, including the 48-hour chat history/review and custom runtime configuration. It does not delete source code, secrets, or Google Calendar events.

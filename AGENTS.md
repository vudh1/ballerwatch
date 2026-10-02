# BallerWatch agent guidance

Always read the current `README.md`, this file, and `features/versions.json` from `main` before making changes. Do not rely on an older scheduler prompt when the repository says something newer.

## Privacy and architecture

- `main` is the integration branch for reviewed source code, static configuration, documentation, and release history. It may be ahead of production. The `production` branch points to the exact commit promoted by the latest published GitHub Release. Do not commit generated runtime state to either branch.
- Durable runtime state lives on the dedicated `runtime-state` branch so frequent state updates do not pollute release history.
- Private runtime files on `runtime-state` must remain AES-GCM encrypted with the existing state-encryption boundary. Never write plaintext rosters, private settings, Telegram text, Calendar IDs, or secrets there.
- `state/chat-history.json` is encrypted and retains the original question and bot answer for up to 48 hours when the exchange is owner-authenticated or the web visitor explicitly marks that answer wrong. Groq classification/summary fields are metadata only and must never replace the source question/answer. Anonymous public-web questions are not retained unless the visitor deliberately submits wrong-answer feedback for that exchange.
- `state/chat-review.json` is the only readable chat-derived review artifact. It may contain only privacy-minimized engineering signals: timestamp, `bug_candidate|feature_candidate|negative_feedback`, short sanitized summary, and short sanitized reason. Never include names, IDs, tokens, URLs, addresses, raw questions, raw replies, or quotes.
- Explicit `/feature <request>` remains a deliberate feature-request path. Ordinary unanswered questions and thumbs-down feedback belong in the 48-hour chat review flow instead of automatically becoming feature requests.
- Cloudflare Workers hosts the public-safe PWA API plus an optional Telegram webhook adapter. Core PWA Q&A, owner password authentication, encrypted runtime access, and Web Push must remain usable when Telegram credentials are absent and `TRACKER_STATE_KEY` is configured. **Workers KV is not part of the production runtime and Cloudflare Cron Triggers must stay disabled.**
- The fast path reads encrypted state from the `runtime-state` branch and uses the Workers Cache API only as a short-lived best-effort cache.
- The GitHub Pages PWA keeps anonymous/public access read-only. Owner settings use app-native password sign-in after bootstrap; a temporary six-digit `/webpair` code remains only as a first-time/recovery path and can authorize multiple devices until its 10-minute expiry. Only an owner-authenticated device may read/change the limited settings surface (RSVP name and monitored league teams). Wrong-answer feedback is separately authorized by a short-lived token scoped to the exact answer and does not grant settings access. Arbitrary state-changing commands remain outside the public web API.
- Web Push VAPID keys and subscriptions live only in encrypted `state/web-push.json` on `runtime-state`; never commit a VAPID private key or push endpoint to `main`.
- Web notification-board entries exposed to the public Pages origin must be public-safe: never include RSVP names, waitlist names, owner-specific status, tokens, IDs, or private settings.
- The 14-day weather cache lives encrypted in `state/weather.json`. It may contain public venue names/addresses, cached coordinates, and match-window forecasts, but never roster or owner-private data. New venue geocoding must be cached and rate-limited; weather refreshes run at most every 6 hours.
- cron-job.org is the primary high-frequency scheduler for pickup (2 minutes) and league (5 minutes) only. The legacy listener schedule and retired external watchdog schedule must remain disabled. System watchdog/maintenance runs from a native GitHub Actions schedule every 6 hours and also refreshes the 14-day match-weather snapshot.
- GitHub Actions pulls state from `runtime-state`, performs reconciliation/notifications/Calendar work, pushes only changed state back, then removes local runtime files.
- Encrypted GitHub Actions cache backups remain a secondary recovery source.
- When enabled, Telegram is webhook-driven through Cloudflare. Do not recreate a recurring `getUpdates` poller. Treat Telegram as an optional adapter rather than a dependency of owner Settings or Web Push; `/webpair` may remain a bootstrap/recovery path until a Telegram-independent recovery mechanism is implemented.
- To recover or verify `UPSTREAM_ENDPOINT`, follow `skills/find-upstream-endpoint/SKILL.md`. Never commit the live endpoint.

## Release workflow

Product releases use one release branch per target version, named `release/<version>`. Pure maintenance does not need a release branch unless it is the safest way to review the change.

The default product-release process is:

1. Start `release/<next-version>` from the latest `main`.
2. Make implementation/fix commits on that branch.
3. Do not bump `features/versions.json` until the implementation is green.
4. Run/verify **Validate code**. Release PRs also run the notification-silent **Manual smoke test** when runtime code is affected.
5. Fix failures rather than hiding or bypassing them.
6. After implementation tests pass, update `features/versions.json`, current documentation, and any warranted announcement.
7. Run final validation/smoke again.
8. Mark the PR ready only when final checks are green.
9. Merge with **squash merge only**, so the product release lands on `main` as one release commit.
10. Delete the release branch after merge when practical.

Merging to `main` does **not** deploy production. Production is release-gated:

- `production` points to the latest promoted release commit.
- A published GitHub Release/tag such as `v5.7.0` is the production promotion event.
- The **Promote production release** workflow checks the candidate on `main`, requires successful validation, waits at least 24 hours on its daily automatic path, then advances `production` and publishes the GitHub Release.
- The same workflow may be manually run to promote a product version immediately; manual promotion skips the 24-hour soak but still requires validation.
- Pages, Worker, Calendar-bridge bootstrap, weather bootstrap, and web-runtime deployment workflows listen to published releases rather than pushes to `main`.
- Scheduled/dispatch runtime workflows execute code from `production`, so unreleased `main` code does not silently become runtime behavior.
- If a GitHub Release for the current version already exists, the promoter is a no-op. This is how maintenance commits can merge without creating another rollout.

Direct commits to `main` remain permitted for emergencies or explicit user-directed maintenance, but normal reviewed changes should still use a PR. Product release commits should remain easy to identify; maintenance commits may exist between them without inventing a new product version.

## Notification policy

Proactive Telegram and Web Push output share the same allowlist. Production may send only:

- pickup RSVP/capacity notifications from the established pickup watcher logic;
- real RATS match-schedule changes;
- one combined version-change announcement per Pacific day.

Direct replies to owner Telegram input are also allowed.

Do not send Telegram messages or Web Push signals for watchdog failures/recovery, tests, smoke runs, builds, deploys, commits, pull requests, score-only changes, setup reminders, invalid-setting reminders, or other engineering/health events.

Version announcements are derived from `features/versions.json`, combine every pending version into one message, use only user-facing release summaries, and are limited to one message per Pacific calendar day. `features/announcements.json` is legacy and must not drive Telegram sends.

## Testing

Tests, audits, smoke tests, and temporary verification runs must **not send Telegram messages or Web Push signals**.

Use the notification-silent Manual smoke test for live-source verification. Do not add production notifications to PR tests.

All test-only source files live under `tests/`, mirroring the production source area where practical. Do not place `*.test.mjs` or smoke-only scripts beside runtime modules.

For RATS changes, preserve the fast path that tries the last known season before broader discovery and fetches independent team schedule exports concurrently.

When testing runtime persistence, use encrypted fixtures or the real `runtime-state` branch through the supported runtime-state helper. Never put decrypted runtime files in an artifact or commit.

## Watchdog

The watchdog must verify:

- Cloudflare webhook health;
- latest validation health;
- public-repo privacy rules; and
- cron-job.org primary scheduler existence, cadence, target, and enabled posture.

The two required cron-job.org jobs must exist with their expected 2/5-minute cadences and remain enabled. The legacy Telegram polling cron and retired external watchdog cron must remain disabled. The native GitHub watchdog schedule runs every 6 hours.

## Versioning

Version numbers represent **actual product changes**, not repository activity.

- PATCH: a backward-compatible user-visible bug fix, reliability/privacy/security behavior change, or production compatibility fix.
- MINOR: a new backward-compatible product capability.
- MAJOR: an intentional breaking product change.
- **No SemVer bump** for documentation-only edits, code refactors with unchanged behavior, formatting/comments, test-only changes, CI/workflow maintenance, dependency/tooling maintenance, or other internal housekeeping that does not change the product's production behavior.
- Maintenance changes that keep the same version must not add a duplicate release-ledger entry or publish a new GitHub Release.
- When a maintenance change intentionally changes production behavior, classify that behavior change normally as PATCH/MINOR/MAJOR.

Release entries may include a user-facing `telegramAnnouncement` while Telegram remains an enabled notification adapter. Release notices are version-based and must never be created merely for commits or pull requests.

## Code style and module documentation

Read `STYLE_GUIDE.md` before editing code.

- Keep runtime modules small and domain-focused; extract pure routing/parsing/formatting logic when a file starts mixing multiple concerns.
- Every non-test runtime `.mjs` file begins with a module documentation block.
- Comments explain responsibility, privacy boundaries, failure behavior, or non-obvious invariants rather than restating syntax.
- When a release materially changes a module's responsibility, update its header/documentation and the relevant `docs/wiki/` page.
- Do not rewrite old release snapshots merely to add comments. Current release documentation is the source of onboarding truth.

## Purge semantics

`PURGE` is a full BallerWatch factory reset. It first deletes BallerWatch-managed RATS Calendar events through the authenticated Calendar bridge, then deletes generated runtime files from the `runtime-state` branch, including custom league-team state, listener settings, notification/watchdog state, Web Push subscriptions/board state, Calendar reconciliation snapshots, and the 48-hour chat history/review. The next runs rebuild defaults, current source snapshots, and future Calendar match events. It does not delete source code, secrets, or unrelated Google Calendar events.

## Cloudflare and storage failure behavior

- If Cloudflare is unavailable, inbound Telegram webhook/fast-path questions and live PWA Q&A/board reads are temporarily unavailable, but cron-job.org continues the 2/5-minute pickup/league workflows and the native six-hour GitHub maintenance/weather schedule remains independent of Cloudflare.
- Existing Web Push subscriptions are signaled directly from GitHub Actions to browser push services, so notification fallback does not depend on Telegram and does not require Cloudflare at send time.
- GitHub production watcher workflows do not depend on Workers KV.
- If the `runtime-state` branch cannot be read, workflows may restore the encrypted last-known Actions-cache backup.
- The Worker may fall back to dispatching the GitHub listener if a direct runtime-state history write fails.
- Do not reintroduce Workers KV as a hot datastore merely for convenience; the free-tier request ceiling is a known operational constraint.

# Proposed calendar subscription identity and authorization (11.7 planning)

Status: **design only — not merged, enabled, or deployed**. FRIDAY coordination: [vudh1/friday#12](https://github.com/vudh1/friday/issues/12).

## Existing behavior to preserve

`GET /web/calendar.ics?teams=...&watch=...&pickup=...` is anonymous, stateless and
read-only. It builds playing/pickup and professional watching VEVENTs using the
published fixture indexes. Existing URLs must remain functional; changing a
device's selections cannot update an old parameter-based URL.

BallerWatch currently stores personal RSVP names and monitored teams per
browser, not in a visitor account. The sole authenticated web login is for
administrator maintenance and **must not become shared visitor identity**.
Encrypted canonical `runtime-state` must remain untouched by calendar-profile
writes. Cloudflare KV and Cron Triggers remain out of the production architecture.

## Proposed v1 owner-side contract

- `POST /web/v1/calendar-profiles`: **after explicit opt-in**, create a
  private calendar profile with a server-minted, cryptographically random
  identifier, and separate read token and write/revoke credential.
- `PUT /web/v1/calendar-profiles/{id}/selection`: authenticated management
  capability, version/ETag compare-and-set, narrow validated selections.
- `POST /web/v1/calendar-profiles/{id}/rotate`: management capability; revoke
  old read token and show a new subscription URL. Rotation necessarily requires
  updating Vela once.
- `DELETE /web/v1/calendar-profiles/{id}`: management capability, immediately
  revoke subscription and delete preferences; no background migration.
- `GET /web/v1/calendar/{opaque-token}.ics`: opaque read-only calendar feed;
  the URL remains unchanged when authorized selections update, and uses the
  same published fixture sources and calendar serialization as legacy ICS.
- Deletion/revocation response must be non-cacheable; never share management
  credentials with Vela. Fail closed on missing/expired/revoked capabilities.
- Minimal profile record: independent profile ID, encrypted arrays of RATS
  and professional team identifiers plus pickup flag, revision, created/updated
  and revoke markers. Do not persist RSVP names, rosters, private match edits,
  push subscriptions or player identities in calendar profiles.

## Identity decision before security-sensitive implementation

1. **Anonymous owner-profile capability (recommended for accountless v1).**
   An explicit user opt-in provisions a scoped private management secret on
   that installation, separate from a 256-bit randomly generated ICS read token.
   No email/account provider required. Linking a second device requires the
   current authorized device to approve a short-lived one-time pairing request;
   new device must prove possession of its own fresh challenge. One profile
   never implies a link to another browser or Vela profile. **Tradeoff:**
   clearing all authorized devices loses management/recovery without a separate
   recovery method. A recovery code can be optionally generated once, scoped
   for restoration, with explicit storage guidance.
2. **Standards-based OIDC/OAuth + PKCE.** More familiar sign-in, multi-device
   access and account recovery. **Tradeoff:** a provider integration, consent
   UX, vendor quotas and more data processing; needs provider selection and
   production secrets.
3. **WebAuthn passkeys.** Strong phishing-resistant credential assertion
   without a shared static password. **Tradeoff:** secure account bootstrap,
   synced-passkey portability and recovery still require an identity policy.

Do not authorize linking through IP, browser fingerprint, Vela display
profile, local PWA cache, household PIN, RSVP display name or the existing
maintenance credential.

## Storage and cost evaluation

Prefer **Cloudflare D1** (one database, logically separate per-profile rows)
rather than a single global watchlist or Workers KV. D1 provides durable
atomic conditional updates suitable for profile revisions and revocation.
Store encrypted sensitive selection blobs using a dedicated Worker secret
and AEAD with per-record nonce, key rotation, authenticated profile ID
associated data and no fallback key. Hash read and write capabilities for
lookup/verification; keep raw credentials only on authorized clients.
Keep Worker encryption material separate from GitHub `TRACKER_STATE_KEY`
and administrator tokens. The exact D1 free-tier limits, per-day billing,
migration, binding and delete behavior must be confirmed before rollout.
Rate-limit writes and reads; do not rely on a global shared token.

## FRIDAY calendar contract v1

Calendar projection is producer-owned and **read-only**. UIDs are stable
source-qualified IDs (not URL or credential derived). Keep `VEVENT`
start/end instants and existing Seattle/local timezone rendering, including
DST behavior and RFC 5545 CRLF folding/escaping. Keep categories playing,
watching, pickup, retain verified location and U.S. broadcast metadata where
available, and do not invent channels or results. Bounded client refresh
and `ETag`/revision invalidation must respect rapid revocation. Vela holds the
ICS URL under its own per-profile encryption and must not receive a write
credential. Existing Google Calendar and legacy ICS sources are unaffected.

## Threats, tests and safe failure

- Two unrelated owners, separate capability pairs: no cross-profile reads or
  writes; team changes preserve read URL and update event content.
- Unauthorized/replayed mutations, stale revision, token brute force,
  expired pairing/management, rotated/revoked read capabilities all fail closed.
- Limit HTTP request bodies, team counts, URLs and fetch frequency; scrub
  Authorization and path tokens from logs/analytics and browser referrers.
- Duplicate-event prevention, event moved/cancelled, ongoing event, UTC/DST
  boundaries, weak/empty sports index, and independent fixture updates.
- Cloudflare/D1 unavailable: device-local choices continue; Vela displays
  bounded last-good calendar (not an invented successful sync).
- Disable v1 endpoint or rollback Worker/DB migration without changing
  legacy ICS or GitHub encrypted runtime-state; leave stale feeds revoked.
- No automatic bulk opt-in, enrollment, account merging, GitHub secrets
  creation, branch promotion or Cloudflare deployment from this document.

## Release gates

Architecture decision and scope approval → isolated implementation branch
→ encryption/authz integration tests and negative tests → browser tests
(Chromium, Firefox, WebKit and device follow-up) → privacy audit / Worker
dry-run / read-only live smoke → PR review → separately authorized release,
runtime audit, Worker health, Pages deployment, and Vela profile refresh.

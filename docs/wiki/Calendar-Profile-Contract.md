# BallerWatch × FRIDAY calendar subscription v1

**Code status:** Implemented in draft branch `release/11.7.0-first-run-setup` and
[PR #196](https://github.com/vudh1/ballerwatch/pull/196). **Not merged or deployed.**
The optional Cloudflare D1 service is **not provisioned by source changes**;
until its database and separate encryption secret are configured, the new APIs
respond unavailable and the original parameter-based ICS links remain usable.
Owner authorization decision: **Option A, independently managed anonymous profiles**
(approved 2026-10-25). Cross-app register:
[FRIDAY issue #12](https://github.com/vudh1/friday/issues/12).

## Owner and consumer boundaries

- **BallerWatch** owns immutable published sports source data, game IDs, and
  the server-side calendar view and encrypted profile selections.
- **Vela TV** holds only the read-only ICS URL per independently selected Vela
  display profile in its existing encrypted calendar storage. It cannot write
  preferences and does not access BallerWatch's encrypted GitHub state.
- **FRIDAY** tracks the versioned contract; no central FRIDAY identity or
  runtime is required. A Vela display profile is never a BallerWatch identity.
- **RSVP upstream** independently owns signups; no participant names,
  waitlists or unpublished roster details are included in profile storage
  or ICS. Pickup inclusion is a boolean, independent of selecting an RSVP name.

## Accountless capabilities

Every opt-in BallerWatch calendar profile receives:

1. An opaque 128-bit random profile identifier (not an email or username).
2. A distinct 256-bit random **read-only** URL token used exclusively for
   `GET /web/v1/calendar-ics/{token}.ics`.
3. A **device-specific** 256-bit management capability; only this credential
   can read selections, change them, rotate the feed, pair other devices,
   revoke other management credentials and delete the profile.
4. A 256-bit **one-time recovery code** displayed once in Settings. The
   code may be replaced by an authorized device; successful recovery rotates
   the code and grants that device its own management credential.

No profile is created or migrated unless the user explicitly clicks
**Enable permanent link** and agrees to the consent dialog. Other browsers
remain isolated. An existing authorized device must explicitly generate a
one-use pairing code, valid for 5 minutes. The receiving browser confirms
linking and redeems the code for **its own management capability**, not a
copy of the sending browser's credential. Pairing codes are consumed
atomically and cannot be replayed. Two-year-expiring manager credentials
are independent of permanent subscription URLs; losing all authorized
devices requires the current recovery code. Read URLs do not expire except
on rotation/deletion, as intended for long-lived Vela subscriptions.

Browser preferences continue to save immediately, with local fallback when
Cloudflare is offline. Linked device changes use compare-and-set revisions
to reject overwriting a concurrent update. On explicit linking, a browser
may import the authorized profile's teams; otherwise it keeps its device
preferences. Only verified authorization can update another device's
selected teams.

## API v1

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/web/v1/calendar-profiles/status` | Public readiness only |
| POST | `/web/v1/calendar-profiles` | Explicit opt-in, create independent profile |
| GET | `/web/v1/calendar-profiles/{id}` | Manage capability, read current selection and stable URL |
| PUT | `/web/v1/calendar-profiles/{id}/selection` | Manage capability, revision CAS |
| POST | `/web/v1/calendar-profiles/{id}/pairings` | Manage capability, generate short-lived code |
| POST | `/web/v1/calendar-pairings/redeem` | Single-use pairing code, grants fresh device credential |
| POST | `/web/v1/calendar-profiles/recover` | One-time recovery code, rotates recovery |
| POST | `/web/v1/calendar-profiles/{id}/recovery` | Manage capability, replace recovery code |
| POST | `/web/v1/calendar-profiles/{id}/rotate` | Manage capability, rotate read URL and revoke prior URL |
| POST | `/web/v1/calendar-profiles/{id}/other-devices` | Manage capability, revoke all other devices and outstanding pairings |
| DELETE | `/web/v1/calendar-profiles/{id}/device` | Manage capability, disconnect current device |
| DELETE | `/web/v1/calendar-profiles/{id}` | Manage capability, delete profile and all grants |
| GET | `/web/v1/calendar-ics/{token}.ics` | Read token only; no writes |

Mutations require an allowed PWA `Origin`, JSON content type, a bounded body,
and a scoped `Authorization: Bearer` capability for privileged operations.
No cookies, login accounts, general maintenance/admin tokens, RSVP name,
shared household PIN or Vela display profile are accepted as authorization.
Unknown profile IDs, wrong credentials, expired capabilities and revoked
tokens fail closed. API responses are `no-store`; ICS subscriptions
are revalidated by their clients. Rate budgets are enforced server-side
for reads and changes, and deployment should also configure a Cloudflare
WAF/rate-limit rule; never log raw request paths, ICS tokens or capabilities.

The original public `GET /web/calendar.ics?teams=...&watch=...&pickup=...`
continues without modifications. Its query-based link still requires
replacement after the encoded choices change.

## Durable storage, key management, free tier

New `CALENDAR_PROFILES` D1 binding only, with migration:
`backend/infra/web-worker/migrations/0001_calendar_profiles.sql`.
All sensitive selections and retrievable read URLs are AES-256-GCM envelopes
using a **dedicated** Worker/GitHub Actions secret `CALENDAR_SYNC_KEY`
(32 random bytes encoded base64url, never a fallback from
`TRACKER_STATE_KEY`). Each envelope authenticates its profile identifier
and purpose as additional data. D1 stores only SHA-256 capability hashes
for lookup, ciphertext, revision numbers and minimal operational timestamps.
No device IP, plaintext identity, team selection or secret is stored.
Abuse-rate keys are time-bucketed salted digests, not plaintext IP addresses.

Before an authorized production rollout:

1. Create the Cloudflare D1 database `ballerwatch-calendar-profiles`
   using a Cloudflare token with appropriate D1 permissions and keep its
   database identifier private.
2. Configure two distinct repository Actions secrets:
   `CALENDAR_D1_DATABASE_ID` and `CALENDAR_SYNC_KEY`. Never commit
   values to Git, logs, workflow arguments or FRIDAY.
3. The existing release Worker workflow fails closed if only one is set,
   generates an optional binding, applies migrations before Worker deploy,
   installs the separate encryption key, and checks the read-only
   `/web/v1/calendar-profiles/status` readiness response.
4. Verify free-tier D1 database size and daily read/write allowances and
   Cloudflare Worker quotas before production, set Cloudflare edge rate
   limits, and verify restore/key-rotation and backup procedures.
5. Separately authorize feature-branch integration to `main`/beta and
   later a reviewed production release; neither is implicit.

Do not destroy or change the dedicated AES-GCM key without a reviewed
re-encryption/key-rotation migration. Otherwise current ciphertext will
be unreadable. D1 and GitHub encrypted `runtime-state` have independent
operational and recovery domains. No Workers KV or Cloudflare Cron Trigger
is required or enabled for this service.

## Event contract v1: BallerWatch → Vela TV

Both feed types use the **same** BallerWatch
`backend/shared/ical-feed.mjs` formatter and authoritative fixture index.
They serialize `VCALENDAR`/`VEVENT` RFC 5545 with stable
`{encoded source-game-id}@ballerwatch` UIDs, timezone-aware UTC
`DTSTART`/`DTEND`, `X-WR-TIMEZONE: America/Los_Angeles`,
`LAST-MODIFIED` when published, `STATUS:CANCELLED` where appropriate,
`SUMMARY`, `LOCATION`, and relevant `DESCRIPTION` fields. Repeated
multi-team matches are de-duplicated by game ID; unknown TV channels
are not invented. Categories are conveyed as **Playing**/**Watching**
in existing descriptions (pickup belongs to Playing). Vela may map them
to FRIDAY's All / Playing / Watching / Life categories. This v1 adds no
cross-app write permission and does not change Vela's existing Google
Calendar support or per-display-profile encrypted settings.

Consumers should refresh periodically, honor no-store and revocation,
retain bounded last-good results only for temporary offline read
failures, and never resurrect an intentionally revoked link. A profile's
team changes and published fixture updates both appear when Vela next
fetches its **unchanged** link. Rotation is an intentional exception:
the link changes, and the owner must replace it in Vela.

## Negative tests and rollback

Synthetic D1 tests cover independently managed profiles, cross-user
authorization denial, CAS/replay, hashed/encrypted storage, stale pairing,
recovery rotation, token rotation/revocation, deletion, credential expiry,
bounded requests, and disabled-worker fallback. Existing iCalendar tests
cover stable UID, duplicate elimination, events in progress, timezones and
DST. New PWA tests cover explicit opt-in, URL stability, no automatic
pairing and persistent device storage. CI is notification-silent.

If the new storage/binding fails, leave the service disabled and keep
legacy ICS and local Play/Watch unaffected. Roll back a reviewed release
rather than exposing D1 directly or copying encrypted GitHub state.
A GitHub PR merge is not a GitHub Release and never constitutes
production deployment or device verification.

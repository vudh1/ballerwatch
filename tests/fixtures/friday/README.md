# Synthetic BallerWatch → Vela ICS fixture

This test-only producer fixture uses invented teams and venues, with no real
subscriber URL, token, device, roster or encrypted runtime-state data.

From a BallerWatch checkout, generate either complete response body:

```sh
node --input-type=module -e 'import { syntheticCalendarIcs } from "./tests/fixtures/friday/ballerwatch-calendar-v1.mjs"; process.stdout.write(syntheticCalendarIcs("initial"))'
node --input-type=module -e 'import { syntheticCalendarIcs } from "./tests/fixtures/friday/ballerwatch-calendar-v1.mjs"; process.stdout.write(syntheticCalendarIcs("updated"))'
```

The **initial** feed has two Pacific local-time Playing matches on opposite
sides of the 2026 spring DST transition, a Watching match that is in progress
at 2026-11-01T18:00:00Z, one cancelled Watching event, and a duplicate
Watching source item intentionally collapsed to one RFC 5545 UID.

The **updated** feed retains the same UID for unchanged games, removes an
older Playing match from the complete snapshot, and removes the previously
published TV channel instead of guessing a replacement. A consumer must
reconcile removed UIDs on a successful full refresh, honor STATUS:CANCELLED,
and not treat a temporary fetch failure as evidence of source deletion.

A denied/revoked profile response is **not** an ICS fixture. Consumer tests
should separately simulate HTTP 404/403 for revocation and 429/503/network
failure for retry/offline limits, then verify that a shared/Guest profile
never displays another Vela profile's protected last-good cache. No source
test can validate TV hardware or an account's Cloudflare bill.

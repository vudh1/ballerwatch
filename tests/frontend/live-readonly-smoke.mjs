/**
 * Notification-silent readiness check using existing anonymous production GETs.
 * Baseline: v8.10.0. No accounts, decrypted state, push, RSVP or Calendar writes.
 * Logs only contract readiness; never logs match details or API response bodies.
 */
import assert from "node:assert/strict";

const origin = "https://ballerwatch-web.vudhone.workers.dev";
for (const endpoint of ["/health", "/web/config", "/web/next-game", "/web/calendar"]) {
  const response = await fetch(origin + endpoint, {
    cache: "no-store", signal: AbortSignal.timeout(25_000),
  });
  assert.equal(response.status, 200, `${endpoint} HTTP status`);
  const payload = await response.json();
  assert.notEqual(payload.ok, false, `${endpoint} readiness`);
  if (endpoint === "/web/config") assert.match(payload.version, /^\d+\.\d+\.\d+$/);
  if (endpoint === "/web/calendar") {
    assert.ok(payload.calendar?.startDate);
    assert.ok(Array.isArray(payload.calendar.games));
  }
  if (endpoint === "/web/next-game") assert.ok("game" in payload);
  console.log(`PASS read-only ${endpoint}`);
}

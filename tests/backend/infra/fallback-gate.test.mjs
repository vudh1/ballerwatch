import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFallback } from "../../../backend/infra/fallback-gate.mjs";

test("fresh Cloudflare heartbeat skips duplicate pickup work", () => {
  assert.deepEqual(
    evaluateFallback("pickup", { ok: true, kv: true, pickupAgeMinutes: 2 }),
    { shouldRun: false, reason: "edge-healthy" },
  );
});

test("stale or unavailable Cloudflare allows fallback", () => {
  assert.equal(evaluateFallback("league", { ok: true, kv: true, leagueAgeMinutes: 30 }).shouldRun, true);
  assert.equal(evaluateFallback("pickup", null).shouldRun, true);
});

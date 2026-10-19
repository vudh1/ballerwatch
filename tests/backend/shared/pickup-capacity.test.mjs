import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PICKUP_CAPACITY,
  effectivePickupCapacity,
} from "../../../backend/shared/pickup-capacity.mjs";

test("unconfigured pickup cap defaults to 16 slots", () => {
  assert.equal(DEFAULT_PICKUP_CAPACITY, 16);
  for (const value of [undefined, null, "", "   ", 0, "0", -2,
    "unlimited", NaN, Infinity, 1.5]) {
    assert.equal(effectivePickupCapacity(value), 16, `missing/invalid cap ${String(value)}`);
  }
});

test("valid explicitly configured caps override the 16-slot fallback", () => {
  for (const value of [1, 12, 16, 20, "24", " 32 "]) {
    assert.equal(effectivePickupCapacity(value), Number(value));
  }
});

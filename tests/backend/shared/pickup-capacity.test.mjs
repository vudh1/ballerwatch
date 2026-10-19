import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PICKUP_CAPACITY,
  effectivePickupCapacity,
  sourcePickupCapacity,
  visiblePickupCapacity,
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

test("source capacity is never inferred from the notification default", () => {
  for (const value of [undefined, null, "", " ", 0, -1, "unlimited", 1.5]) {
    assert.equal(sourcePickupCapacity(value), null);
  }
  for (const value of [12, 16, 20, "24"]) {
    assert.equal(sourcePickupCapacity(value), Number(value));
    assert.equal(visiblePickupCapacity({ capacity: 16, publishedCapacity: value }), Number(value));
  }
  assert.equal(visiblePickupCapacity({ capacity: 16, publishedCapacity: null }), null);
  assert.equal(visiblePickupCapacity({ capacity: 16 }), null, "legacy 16 could be an assumed limit");
  assert.equal(visiblePickupCapacity({ capacity: 24 }), 24, "legacy non-default source cap remains visible");
  assert.equal(visiblePickupCapacity({ capacity: null }), null);
});

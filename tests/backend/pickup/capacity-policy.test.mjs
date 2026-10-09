import test from "node:test";
import assert from "node:assert/strict";
import { pickupCapacityAlert } from "../../../backend/pickup/capacity-policy.mjs";

function check(before, after, capacity) {
  return pickupCapacityAlert(
    { reserved: before, capacity },
    { reserved: after, capacity },
  );
}

test("RSVP capacity milestones scale dynamically for every match capacity", () => {
  for (const capacity of [12, 16, 20, 21]) {
    const p25 = Math.ceil(capacity * 0.25);
    const p50 = Math.ceil(capacity * 0.50);
    const p75 = Math.ceil(capacity * 0.75);
    assert.equal(check(p25 - 1, p25, capacity)?.kind, "25%");
    assert.equal(check(p50 - 1, p50, capacity)?.kind, "50%");
    assert.equal(check(p75 - 1, p75, capacity)?.kind, "75%");
    for (let count = p75 + 1; count < capacity; count++) {
      const alert = check(count - 1, count, capacity);
      assert.equal(alert?.kind, "spot", `a new spot fills at ${count}/${capacity}`);
      assert.equal(alert.remaining, capacity - count);
    }
    assert.equal(check(capacity - 1, capacity, capacity)?.kind, "full");
  }
});

test("for 16 slots, alert at 4, 8, 12, 13, 14, 15 and 16 reservations", () => {
  const alerts = [];
  for (let count = 1; count <= 16; count++) {
    const alert = check(count - 1, count, 16);
    if (alert) alerts.push([count, alert.kind]);
  }
  assert.deepEqual(alerts, [
    [4, "25%"], [8, "50%"], [12, "75%"],
    [13, "spot"], [14, "spot"], [15, "spot"], [16, "full"],
  ]);
});

test("single update after several new reservations sends only the latest relevant alert", () => {
  assert.equal(check(2, 8, 16)?.kind, "50%");
  assert.equal(check(7, 13, 16)?.kind, "75%");
  assert.equal(check(2, 16, 16)?.kind, "full");
  assert.equal(check(12, 15, 16)?.kind, "spot");
});

test("never alert when no new reservation was observed", () => {
  assert.equal(pickupCapacityAlert(null, {reserved:12,capacity:16}), null);
  assert.equal(pickupCapacityAlert({reserved:12,capacity:16}, {reserved:12,capacity:16}), null);
  assert.equal(pickupCapacityAlert({reserved:12,capacity:16}, {reserved:11,capacity:16}), null);
  assert.equal(pickupCapacityAlert({reserved:10,capacity:16}, {reserved:12,capacity:20}), null);
  assert.equal(pickupCapacityAlert({reserved:10,capacity:null}, {reserved:12,capacity:16}), null);
  assert.equal(pickupCapacityAlert({reserved:12,capacity:16}, {reserved:13,capacity:null}), null);
  assert.equal(check(1, 3, 0), null);
  assert.equal(check(2, 3, 16), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  FREE_PICKUP,
  freePickupBase,
  furthestIsoDate,
  saturdayFreePickupDates,
} from "../../../backend/shared/free-pickup.mjs";

test("Saturday free pickup fills only through the furthest published source date", () => {
  assert.equal(
    furthestIsoDate(["2026-10-06", "2026-10-24", "2026-10-15"]),
    "2026-10-24",
  );
  assert.deepEqual(
    saturdayFreePickupDates("2026-10-03", "2026-10-24"),
    ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"],
  );
  assert.deepEqual(
    saturdayFreePickupDates("2026-10-04", "2026-10-23"),
    ["2026-10-10", "2026-10-17"],
  );
});

test("free pickup base has fixed Jefferson Park schedule and no RSVP", () => {
  const game = freePickupBase("2026-10-10");
  assert.equal(game.id, "free:2026-10-10");
  assert.equal(game.kind, "free_pickup");
  assert.equal(game.startTime, "10:30");
  assert.equal(game.endTime, "12:30");
  assert.equal(game.location, "Jefferson Park Playfield");
  assert.equal(game.mapsQuery, "1600 S Columbian Way, Seattle, WA 98108");
  assert.equal(game.rsvpUrl, "");
  assert.equal(FREE_PICKUP.title, "Free Pickup");
});

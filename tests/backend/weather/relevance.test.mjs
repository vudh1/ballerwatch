import test from "node:test";
import assert from "node:assert/strict";

import {
  pickupWeatherChanged,
  pickupWeatherSignature,
} from "../../../backend/weather/relevance.mjs";

function state({
  date = "2026-10-07",
  startTime = "20:00",
  endTime = "22:00",
  fieldName = "Field A",
  address = "Seattle, WA",
  reserved = 8,
  capacity = 16,
  players = [],
} = {}) {
  return {
    feed: {
      events: {
        [date]: { ok: true, startTime, endTime, reserved, capacity },
      },
    },
    privateState: {
      events: {
        [date]: { fieldName, address, players },
      },
    },
  };
}

test("pickup weather signature excludes RSVP and roster changes", () => {
  const before = state({ reserved: 8, players: [{ name: "A" }] });
  const after = state({ reserved: 14, players: [{ name: "B" }] });
  assert.deepEqual(
    pickupWeatherSignature(before.feed, before.privateState),
    pickupWeatherSignature(after.feed, after.privateState),
  );
  assert.equal(
    pickupWeatherChanged(
      before.feed,
      before.privateState,
      after.feed,
      after.privateState,
    ),
    false,
  );
});

test("pickup weather refreshes when date, time, field, or address changes", () => {
  const before = state();
  for (const change of [
    { date: "2026-10-08" },
    { startTime: "20:30" },
    { endTime: "22:30" },
    { fieldName: "Field B" },
    { address: "Mercer Island, WA" },
  ]) {
    const after = state(change);
    assert.equal(
      pickupWeatherChanged(
        before.feed,
        before.privateState,
        after.feed,
        after.privateState,
      ),
      true,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLeagueMatchOverride,
  applyPickupMatchOverride,
  cleanHiddenMatches,
  cleanMatchOverrides,
  leagueOverrideId,
  normalizeClock24,
  matchHidden,
  normalizeMatchOverrideInput,
  pickupOverrideId,
} from "../../shared/match-overrides.mjs";

test("match overrides normalize date/time and retain immutable source IDs", () => {
  assert.equal(normalizeClock24("8:15 PM"), "20:15");
  assert.equal(pickupOverrideId("2026-10-06"), "pickup:2026-10-06");
  assert.equal(leagueOverrideId({ key: "v2:abc" }), "league:v2:abc");

  const value = normalizeMatchOverrideInput({
    id: "pickup:2026-10-06",
    date: "2026-10-07",
    startTime: "21:00",
    endTime: "23:00",
    location: "Manual Field",
  }, { now: new Date("2026-10-03T20:00:00Z") });

  assert.equal(value.date, "2026-10-07");
  assert.equal(value.startTime, "21:00");
  assert.equal(value.location, "Manual Field");
  assert.equal(value.updatedAt, "2026-10-03T20:00:00.000Z");
});

test("pickup override changes visible fields without changing source identity", () => {
  const settings = {
    matchOverrides: {
      "pickup:2026-10-06": {
        id: "pickup:2026-10-06",
        kind: "pickup",
        date: "2026-10-07",
        startTime: "21:00",
        endTime: "23:00",
        location: "Manual Field",
        updatedAt: "2026-10-03T20:00:00.000Z",
      },
    },
  };
  const result = applyPickupMatchOverride({
    sourceDate: "2026-10-06",
    date: "2026-10-06",
    startTime: "20:00",
    endTime: "22:00",
    fieldName: "Source Field",
    address: "Source Address",
  }, settings);
  assert.equal(result.id, "pickup:2026-10-06");
  assert.equal(result.sourceDate, "2026-10-06");
  assert.equal(result.date, "2026-10-07");
  assert.equal(result.fieldName, "Manual Field");
  assert.equal(result.address, "");
  assert.equal(result.manualOverride, true);
  assert.equal(result.sourceDate, "2026-10-06");
  assert.equal(result.sourceStartTime, "20:00");
  assert.equal(result.sourceLocation, "Source Field");
});

test("league override retains schedule key and rebuilds effective start", () => {
  const game = {
    key: "v2:league-1",
    team: "A",
    opponent: "B",
    date: "2026-10-06",
    startTime: "20:00",
    endTime: "22:00",
    start: "2026-10-06T20:00:00-07:00",
    end: "2026-10-06T22:00:00-07:00",
    location: "Source Field",
  };
  const settings = {
    matchOverrides: {
      "league:v2:league-1": {
        id: "league:v2:league-1",
        kind: "league",
        date: "2026-10-08",
        startTime: "19:30",
        endTime: "21:30",
        location: "Manual League Field",
        updatedAt: "2026-10-03T20:00:00.000Z",
      },
    },
  };
  const result = applyLeagueMatchOverride(game, settings);
  assert.equal(result.overrideId, "league:v2:league-1");
  assert.equal(result.date, "2026-10-08");
  assert.equal(result.start, "2026-10-08T19:30:00-07:00");
  assert.equal(result.location, "Manual League Field");
  assert.equal(result.manualOverride, true);
});

test("invalid override records are dropped during state cleanup", () => {
  assert.deepEqual(cleanMatchOverrides({
    bad: { date: "not-a-date" },
  }), {});
});


test("free pickup overrides retain the generated Saturday source identity", async () => {
  const { applyFreePickupMatchOverride } = await import("../../shared/match-overrides.mjs");
  const source = {
    id: "free:2026-10-10",
    sourceDate: "2026-10-10",
    date: "2026-10-10",
    startTime: "10:30",
    endTime: "12:30",
    location: "Jefferson Park Playfield",
    mapsQuery: "Jefferson Park Playfield, Seattle, WA",
  };
  const result = applyFreePickupMatchOverride(source, {
    matchOverrides: {
      "free:2026-10-10": {
        id: "free:2026-10-10",
        kind: "free",
        date: "2026-10-11",
        startTime: "11:00",
        endTime: "13:00",
        location: "Manual Park",
        updatedAt: "2026-10-03T20:00:00Z",
      },
    },
  });
  assert.equal(result.id, "free:2026-10-10");
  assert.equal(result.sourceDate, "2026-10-10");
  assert.equal(result.date, "2026-10-11");
  assert.equal(result.location, "Manual Park");
  assert.equal(result.manualOverride, true);
});


test("hidden match state is sanitized and keyed by immutable match ID", () => {
  const hidden = cleanHiddenMatches({
    "pickup:2026-10-08": {
      label: "Pickup",
      date: "2026-10-08",
      hiddenAt: "2026-10-05T17:00:00Z",
    },
    invalid: { label: "drop me" },
  });
  assert.deepEqual(Object.keys(hidden), ["pickup:2026-10-08"]);
  assert.equal(hidden["pickup:2026-10-08"].label, "Pickup");
  assert.equal(matchHidden({ hiddenMatches: hidden }, "pickup:2026-10-08"), true);
  assert.equal(matchHidden({ hiddenMatches: hidden }, "league:v2:other"), false);
});

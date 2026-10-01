import assert from "node:assert/strict";
import test from "node:test";

import {
  compare,
  pairHash,
  sameCalendarMatch,
} from "../../league/calendar-gate.mjs";

const NOW = new Date("2026-10-01T12:00:00-07:00");

function match(key, date = "2026-10-05", fingerprint = "fp-new") {
  return {
    key,
    team: "Team Alpha",
    opponent: "Opponent",
    homeAway: "away",
    date,
    start: `${date}T19:15:00-07:00`,
    end: `${date}T20:15:00-07:00`,
    calendarFingerprint: fingerprint,
  };
}

test("unchanged match is not pending", () => {
  const current = match("same", "2026-10-05", "fp");
  const feed = {teams: [{matches: [current]}]};
  const state = {appliedMatches: {same: {fingerprint: "fp", match: current}}};
  assert.deepEqual(compare(feed, state, NOW).pending, []);
});

test("old score-inclusive fingerprint migrates silently", () => {
  const current = match("same", "2026-10-05", "new-schedule-only");
  const previous = {
    ...current,
    calendarFingerprint: "old-score-inclusive",
    teamScore: 1,
    opponentScore: 0,
  };
  current.teamScore = 2;
  current.opponentScore = 1;

  assert.equal(sameCalendarMatch(previous, current), true);
  const feed = {teams: [{matches: [current]}]};
  const state = {
    appliedMatches: {
      same: {fingerprint: "old-score-inclusive", match: previous},
    },
  };
  assert.deepEqual(compare(feed, state, NOW).pending, []);
});

test("real schedule change remains pending", () => {
  const current = match("same", "2026-10-05", "new-schedule-only");
  const previous = {
    ...current,
    calendarFingerprint: "old-score-inclusive",
    start: "2026-10-05T18:15:00-07:00",
  };
  assert.equal(sameCalendarMatch(previous, current), false);
  const result = compare(
    {teams: [{matches: [current]}]},
    {appliedMatches: {same: {fingerprint: "old-score-inclusive", match: previous}}},
    NOW,
  );
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].type, "changed");
});

test("unique pair hash marks key change as reschedule", () => {
  const current = match("new-key", "2026-10-06");
  const state = {
    appliedMatches: {
      "old-key": {
        fingerprint: "fp-old",
        match: null,
        pairHash: pairHash(current),
      },
    },
  };
  const result = compare({teams: [{matches: [current]}]}, state, NOW);
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].type, "rescheduled");
  assert.equal(result.pending[0].oldKey, "old-key");
});

test("ambiguous pair hash does not guess", () => {
  const current = match("new-key", "2026-10-06");
  const hash = pairHash(current);
  const state = {
    appliedMatches: {
      "old-a": {fingerprint: "a", match: null, pairHash: hash},
      "old-b": {fingerprint: "b", match: null, pairHash: hash},
    },
  };
  const result = compare({teams: [{matches: [current]}]}, state, NOW);
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].type, "new");
  assert.equal("oldKey" in result.pending[0], false);
});

test("pair hash matches legacy Python implementation", () => {
  assert.equal(
    pairHash(match("x")),
    "ddb22c2f63c8a09655d48a0a960186c38d16639575e2007a77ed868790ad404f",
  );
});

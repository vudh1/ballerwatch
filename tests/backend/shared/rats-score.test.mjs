import test from "node:test";
import assert from "node:assert/strict";

import {
  ratsEventScore,
  ratsScorePair,
} from "../../../backend/shared/rats-score.mjs";

test("RATS score parser handles the public compact score string", () => {
  assert.deepEqual(ratsScorePair("3-1"), [3, 1]);
  assert.deepEqual(ratsScorePair(" 10 - 2 "), [10, 2]);
  assert.deepEqual(ratsScorePair("0:0"), [0, 0]);
});

test("RATS event score maps compact strings to home and away sides", () => {
  const event = { score: "4-2" };
  assert.equal(ratsEventScore(event, "home"), 4);
  assert.equal(ratsEventScore(event, "away"), 2);
});

test("RATS event score preserves explicit and nested legacy forms", () => {
  assert.equal(ratsEventScore({home_score: "5"}, "home"), 5);
  assert.equal(ratsEventScore({score: {home: 2, away: 3}}, "away"), 3);
  assert.equal(ratsEventScore({score: [1, 1]}, "home"), 1);
});

test("RATS score parser fails closed on ambiguous text", () => {
  assert.equal(ratsScorePair("Final 3-1"), null);
  assert.equal(ratsScorePair("3-1 (PK 5-4)"), null);
  assert.equal(ratsEventScore({score: ""}, "home"), null);
});

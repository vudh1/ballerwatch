import test from "node:test";
import assert from "node:assert/strict";
import { classifyIndexedIntent } from "./intent-index.mjs";

test("routes common pickup phrasing without AI", () => {
  assert.equal(classifyIndexedIntent("do we still have spots left?"), "pickup_status");
  assert.equal(classifyIndexedIntent("what field are we at?"), "pickup_status");
});

test("routes league and release questions", () => {
  assert.equal(classifyIndexedIntent("which league teams are monitored?"), "league_teams");
  assert.equal(classifyIndexedIntent("what is the current release version?"), "version");
});

test("returns null for unrelated requests", () => {
  assert.equal(classifyIndexedIntent("please change my calendar"), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { classifyIndexedIntent } from "./intent-index.mjs";

test("routes common pickup phrasing without AI", () => {
  assert.equal(classifyIndexedIntent("do we still have spots left?"), "pickup_status");
  assert.equal(classifyIndexedIntent("what field are we at?"), "pickup_status");
  assert.equal(classifyIndexedIntent("show me the pickup game details"), "pickup_status");
});

test("routes schedule phrasing learned from chat review", () => {
  assert.equal(classifyIndexedIntent("what's today's schedule?"), "today_games");
  assert.equal(classifyIndexedIntent("what games are on 10/5?"), "date_games");
  assert.equal(classifyIndexedIntent("schedule for 10/1"), "date_games");
  assert.equal(classifyIndexedIntent("recommend a game"), "next_game");
});

test("routes league and release questions", () => {
  assert.equal(classifyIndexedIntent("which league teams are monitored?"), "league_teams");
  assert.equal(classifyIndexedIntent("what is the current release version?"), "version");
});

test("returns null for unrelated requests", () => {
  assert.equal(classifyIndexedIntent("please change my calendar"), null);
});

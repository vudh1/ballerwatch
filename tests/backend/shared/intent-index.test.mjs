import test from "node:test";
import assert from "node:assert/strict";
import { classifyIndexedIntent } from "../../../backend/shared/intent-index.mjs";

test("routes common pickup phrasing without AI", () => {
  assert.equal(classifyIndexedIntent("do we still have spots left?"), "pickup_status");
  assert.equal(classifyIndexedIntent("what field are we at?"), "pickup_status");
  assert.equal(classifyIndexedIntent("am i signed up for pickup?"), "pickup_status");
});

test("routes flexible schedule and game-detail phrasing without AI", () => {
  assert.equal(classifyIndexedIntent("what's today's schedule?"), "today_games");
  assert.equal(classifyIndexedIntent("what games are on 10/5?"), "date_games");
  assert.equal(classifyIndexedIntent("who do we play on 10/5?"), "date_games");
  assert.equal(classifyIndexedIntent("what jersey color should i wear?"), "date_games");
  assert.equal(classifyIndexedIntent("recommend a game"), "next_game");
});

test("tolerates small meaningful typos", () => {
  assert.equal(classifyIndexedIntent("what jersy color should i wear"), "date_games");
  assert.equal(classifyIndexedIntent("show pickup availabilty"), "pickup_status");
});

test("routes league and release questions", () => {
  assert.equal(classifyIndexedIntent("which league teams are monitored?"), "league_teams");
  assert.equal(classifyIndexedIntent("what is the current release version?"), "version");
});

test("returns null for unrelated requests", () => {
  assert.equal(classifyIndexedIntent("please change my calendar"), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { watchedFixtures, watchingTeamKey } from "../../../backend/sports/watch-team-matching.mjs";

const start = "2026-11-04T20:00:00Z";
const make = (id, competition, teams, kind = "watch") =>
  ({ id, kind, sport: "soccer", startUtc: start, competition, teams });

test("follow a Premier League club into Champions League and Europa League with one saved selection", () => {
  const games = [
    make("watch:eng.1:1", "Premier League", ["Premier League · Arsenal", "Premier League · Chelsea"]),
    make("watch:uefa.champions:2", "UEFA Champions League",
      ["UEFA Champions League · Arsenal", "UEFA Champions League · Benfica"]),
    make("watch:uefa.europa:3", "UEFA Europa League",
      ["UEFA Europa League · Arsenal", "UEFA Europa League · Porto"]),
    make("watch:uefa.champions:4", "UEFA Champions League",
      ["UEFA Champions League · Dortmund", "UEFA Champions League · Porto"]),
  ];
  const index = { teams: ["Premier League · Arsenal", "UEFA Champions League · Benfica"], games };
  const selected = watchedFixtures(index, ["Premier League · Arsenal"], Date.parse(start));
  assert.deepEqual(selected.map(match => match.id),
    ["watch:eng.1:1", "watch:uefa.champions:2", "watch:uefa.europa:3"]);
  assert.equal(new Set(selected.map(match => match.id)).size, 3);
  assert.deepEqual(watchedFixtures(index, ["Unknown League · Arsenal"], Date.parse(start)), []);
  assert.deepEqual(watchedFixtures(index, ["National · Arsenal"], Date.parse(start)), []);
});

test("new European-only club selection can follow across cups without polluting other sports", () => {
  const index = { teams: ["UEFA Champions League · Benfica", "NBA · Boston Celtics",
    "National · Portugal"], games: [
    make("watch:uefa.champions:2", "UEFA Champions League",
      ["UEFA Champions League · Benfica", "UEFA Champions League · Arsenal"]),
    make("watch:uefa.europa:3", "UEFA Europa League",
      ["UEFA Europa League · Benfica", "UEFA Europa League · Porto"]),
    make("watch:uefa.nations:4", "UEFA Nations League",
      ["National · Portugal", "National · Spain"]),
    make("watch:fifa.friendly:5", "International Friendlies",
      ["National · Portugal", "National · France"]),
  ] };
  assert.deepEqual(watchedFixtures(index, ["UEFA Champions League · Benfica"], Date.parse(start))
    .map(game => game.id), ["watch:uefa.champions:2", "watch:uefa.europa:3"]);
  assert.deepEqual(watchedFixtures(index, ["National · Portugal"], Date.parse(start))
    .map(game => game.id), ["watch:uefa.nations:4", "watch:fifa.friendly:5"]);
  assert.notEqual(watchingTeamKey("National · Arsenal"),
    watchingTeamKey("Premier League · Arsenal"));
  assert.notEqual(watchingTeamKey("NBA · Barcelona"),
    watchingTeamKey("La Liga · Barcelona"));
});

test("keep the original cutoff, public selection whitelist and 450-game bound", () => {
  const now = Date.parse(start);
  const index = { teams: ["La Liga · Barcelona"],
    games: [
      make("old", "La Liga", ["La Liga · Barcelona", "La Liga · Girona"]),
      ...Array.from({length: 451}, (_, i) => make("new-" + i, "UEFA Champions League",
        ["UEFA Champions League · Barcelona", "UEFA Champions League · Lyon"])),
      make("pickup", "La Liga", ["La Liga · Barcelona"], "pickup"),
    ] };
  index.games[0].startUtc = new Date(now - 5 * 3600000).toISOString();
  assert.equal(watchedFixtures(index, ["La Liga · Barcelona"], now).length, 450);
  assert.equal(watchedFixtures(index, ["La Liga · Barcelona"], now)[0].id, "new-0");
  assert.deepEqual(watchedFixtures(index, ["La Liga · Barcelona2"], now), []);
});

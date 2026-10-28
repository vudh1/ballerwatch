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

test("existing Premier League follow also includes published EFL Cup schedule", () => {
  const index = { teams: ["Premier League · Liverpool", "EFL Cup · Fleetwood Town"],
    games: [
      make("watch:eng.1:20", "Premier League",
        ["Premier League · Liverpool", "Premier League · Chelsea"]),
      make("watch:eng.league_cup:21", "EFL Cup",
        ["EFL Cup · Liverpool", "EFL Cup · Chelsea"]),
      make("watch:eng.league_cup:22", "EFL Cup",
        ["EFL Cup · Fleetwood Town", "EFL Cup · Arsenal"]),
      make("watch:uefa.europa:23", "UEFA Europa League",
        ["UEFA Europa League · Liverpool", "UEFA Europa League · Roma"]),
    ] };
  assert.deepEqual(watchedFixtures(index, ["Premier League · Liverpool"], Date.parse(start))
    .map(game => game.id), ["watch:eng.1:20", "watch:eng.league_cup:21", "watch:uefa.europa:23"]);
  assert.deepEqual(watchedFixtures(index, ["EFL Cup · Fleetwood Town"], Date.parse(start))
    .map(game => game.id), ["watch:eng.league_cup:22"]);
  assert.equal(watchingTeamKey("EFL Cup · Liverpool"),
    watchingTeamKey("Premier League · Liverpool"));
  assert.notEqual(watchingTeamKey("National · England"),
    watchingTeamKey("EFL Cup · England"));
});

test("existing watched clubs inherit all eight new knockout and super cup competitions", () => {
  const leagues = [
    ["Premier League · Arsenal", "FA Cup", "Arsenal", "eng.fa"],
    ["Premier League · Manchester City", "FA Community Shield", "Manchester City", "eng.charity"],
    ["La Liga · Barcelona", "Copa del Rey", "Barcelona", "esp.copa_del_rey"],
    ["La Liga · Real Madrid", "Supercopa de España", "Real Madrid", "esp.super_cup"],
    ["Bundesliga · Bayern Munich", "UEFA Super Cup", "Bayern Munich", "uefa.super_cup"],
    ["Ligue 1 · Paris Saint-Germain", "UEFA Conference League",
      "Paris Saint-Germain", "uefa.europa.conf"],
    ["Premier League · Liverpool", "FIFA Club World Cup", "Liverpool", "fifa.cwc"],
    ["Premier League · Chelsea", "FIFA Intercontinental Cup", "Chelsea", "fifa.intercontinental_cup"],
  ];
  const games = leagues.map(([selected, label, name, code], i) =>
    make("watch:" + code + ":" + i, label, [label + " · " + name,
      label + " · Opponent " + i]));
  const index = { teams: leagues.map(x => x[0]), games };
  for (const [selected, label] of leagues) {
    const matches = watchedFixtures(index, [selected], Date.parse(start));
    assert.equal(matches.length, 1, label);
    assert.equal(matches[0].competition, label);
    assert.equal(watchingTeamKey(selected), watchingTeamKey(label + " · " +
      selected.split(" · ")[1]));
  }
  assert.deepEqual(watchedFixtures(index, ["National · England"], Date.parse(start)), []);
  assert.notEqual(watchingTeamKey("National · Brazil"),
    watchingTeamKey("FIFA Club World Cup · Brazil"));
});

test("two selected aliases cannot duplicate an indexed FA Cup event", () => {
  const game = make("watch:eng.fa:777", "FA Cup",
    ["FA Cup · Manchester United", "FA Cup · Arsenal"]);
  const index = {teams:["Premier League · Manchester United", "FA Cup · Manchester United"],
    games:[game]};
  assert.deepEqual(watchedFixtures(index, index.teams, Date.parse(start)).map(g=>g.id),
    ["watch:eng.fa:777"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_STANDINGS_LOCAL_KEY, PUBLIC_STANDINGS_MAX_AGE_MS,
  publicStandingsOnly, readPublicStandings, writePublicStandings,
} from "../../frontend/web/lib/public-standings-cache.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, val) => values.set(key, val),
  };
}
function example() {
  return {
    season: "Fall 2026", seasonId: "fall-2026",
    updatedAt: "2026-10-14T17:00:00Z",
    credentials: "never-persist",
    cards: [{ team: "Fixture FC", ready: true, division: "2", rows: [{
      name: "Fixture FC", rank: 1, played: 3, wins: 2, draws: 1,
      losses: 0, points: 7, privateRoster: ["Alice"],
    }], recentForm: { games: 10, wins: 6, hidden: "secret" } }],
    matchups: { match: { team: "Fixture FC", opponent: "Test United",
      winPct: 45, drawPct: 20, lossPct: 35, privateToken: "secret" } },
  };
}
test("public standings restore immediately and preserve only allowlisted team fields", () => {
  const s = storage();
  const now = Date.parse("2026-10-14T20:00:00Z");
  assert.equal(writePublicStandings(s, PUBLIC_STANDINGS_LOCAL_KEY, example(), now, "2026-10-14"), true);
  const saved = readPublicStandings(s, PUBLIC_STANDINGS_LOCAL_KEY, now + 5000, "2026-10-14");
  assert.equal(saved.cards[0].rows[0].points, 7);
  assert.equal(saved.matchups.match.winPct, 45);
  assert.equal(saved.cards[0].rows[0].privateRoster, undefined);
  assert.equal(saved.credentials, undefined);
  assert.equal(saved.matchups.match.privateToken, undefined);
  assert.equal(saved.cards[0].recentForm.hidden, undefined);
});
test("stale, previous-day, malformed, oversized and unavailable state is rejected", () => {
  const s = storage(), now = Date.parse("2026-10-14T20:00:00Z");
  writePublicStandings(s, PUBLIC_STANDINGS_LOCAL_KEY, example(), now, "2026-10-14");
  assert.equal(readPublicStandings(s, PUBLIC_STANDINGS_LOCAL_KEY, now + PUBLIC_STANDINGS_MAX_AGE_MS + 1, "2026-10-14"), null);
  assert.equal(readPublicStandings(s, PUBLIC_STANDINGS_LOCAL_KEY, now + 1000, "2026-10-15"), null);
  assert.equal(readPublicStandings(s, PUBLIC_STANDINGS_LOCAL_KEY, now - 90000, "2026-10-14"), null);
  assert.equal(publicStandingsOnly({ cards: Array.from({length: 36}, () => ({ team: "x", rows: [] })) }), null);
  const broken = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(writePublicStandings(broken, PUBLIC_STANDINGS_LOCAL_KEY, example()), false);
  assert.equal(readPublicStandings(broken, PUBLIC_STANDINGS_LOCAL_KEY), null);
});

test("bounded team-specific projections persist but global season projections are rejected", () => {
  const s = storage(), now = Date.parse("2026-10-14T20:00:00Z");
  const base = example();
  const mk = (n) => Object.fromEntries(Array.from({length:n},(_,i)=>
    ["match-"+i,{team:"Fixture FC",opponent:"Team "+i,winPct:40,drawPct:20,lossPct:40}]));
  const slim = {...base,matchups:mk(96)};
  assert.equal(writePublicStandings(s,PUBLIC_STANDINGS_LOCAL_KEY,slim,now,"2026-10-14"),true);
  assert.equal(Object.keys(readPublicStandings(s,PUBLIC_STANDINGS_LOCAL_KEY,now+1,"2026-10-14").matchups).length,96);
  assert.equal(writePublicStandings(s,PUBLIC_STANDINGS_LOCAL_KEY,{...base,matchups:mk(97)},now,"2026-10-14"),false);
});


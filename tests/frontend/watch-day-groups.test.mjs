import test from "node:test";
import assert from "node:assert/strict";
import { watchedDayGroups, watchedDaySportIcons } from "../../frontend/web/lib/watch-day-groups.mjs";

const games = [
  { id:"watch:nba:2",kind:"watch",date:"2026-10-26",startUtc:"2026-10-27T03:00:00Z" },
  { id:"watch:nba:1",kind:"watch",date:"2026-10-26",startUtc:"2026-10-27T01:00:00Z" },
  { id:"watch:eng.1:4",kind:"watch",date:"2026-10-28",startUtc:"2026-10-28T22:00:00Z" },
  { id:"league:5",kind:"league",date:"2026-10-26",startUtc:"2026-10-27T00:00:00Z" },
  { id:"watch:nba:0",kind:"watch",date:"2026-10-10",startUtc:"2026-10-10T00:00:00Z" },
];
test("several same-day watch matches render within one date card and sort by kickoff",()=>{
  const result = watchedDayGroups(games,"2026-10-25",14);
  assert.deepEqual(result.map(x=>x.date), ["2026-10-26","2026-10-28"]);
  assert.deepEqual(result[0].matches.map(x=>x.id),["watch:nba:1","watch:nba:2"]);
});
test("horizon pagination extends by date, without duplicating shared team fixtures",()=>{
  const duplicate = [...games,games[0]];
  assert.equal(watchedDayGroups(duplicate,"2026-10-25",2).length,1);
  assert.equal(watchedDayGroups(duplicate,"2026-10-25",2)[0].matches.length,2);
  assert.equal(watchedDayGroups(duplicate,"2026-10-25",4).length,2);
  assert.deepEqual(watchedDayGroups(duplicate,"invalid",14),[]);
});

test("a selected match day remains a single card with every tracked matchup", () => {
  const extras = [...games,
    {id:"watch:nba:99",kind:"watch",date:"2026-10-26",startUtc:"2026-10-27T04:00:00Z"}];
  const output = watchedDayGroups(extras, "2026-10-25", 14);
  assert.equal(output.filter(x => x.date === "2026-10-26").length, 1);
  assert.equal(output[0].matches.length, 3);
});

test("mixed professional soccer and basketball show both schedule icons once", () => {
  const soccer = { id: "watch:eng.1:10", kind: "watch", sport: "soccer", date: "2026-10-26" };
  const basketball = { id: "watch:nba:12", kind: "watch", sport: "basketball", date: "2026-10-26" };
  assert.deepEqual(watchedDaySportIcons([soccer, basketball]), ["⚽", "🏀"]);
  assert.deepEqual(watchedDaySportIcons([basketball, basketball]), ["🏀"]);
  assert.deepEqual(watchedDaySportIcons([soccer]), ["⚽"]);
  assert.deepEqual(watchedDaySportIcons([{ ...soccer, kind: "league" }]), []);
  assert.deepEqual(watchedDaySportIcons([]), []);
});

test("a full preindexed horizon preserves the future-day total across navigation", () => {
  const match = (day, id) => ({ id, date: day, kind: "watch", sport: "soccer" });
  const full = watchedDayGroups([
    match("2026-10-26", "a"), match("2026-10-29", "b"),
    match("2026-11-15", "c"), match("2026-12-29", "d"),
  ], "2026-10-25", 366);
  assert.equal(full.length, 4);
  assert.deepEqual(full.map(g => g.date),
    ["2026-10-26", "2026-10-29", "2026-11-15", "2026-12-29"]);
});

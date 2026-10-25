import test from "node:test";
import assert from "node:assert/strict";
import { watchedDayGroups } from "../../frontend/web/lib/watch-day-groups.mjs";

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

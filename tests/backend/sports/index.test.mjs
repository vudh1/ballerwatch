import test from "node:test";
import assert from "node:assert/strict";
import { publishedUsBroadcasts } from "../../../backend/sports/broadcasts.mjs";
import { COMPETITIONS, teamLabel, parsedFixtures, parsedTeams } from "../../../backend/sports/index.mjs";
test("NBA, top five European football leagues, UEFA and CONMEBOL represented", () => {
 assert.equal(COMPETITIONS.filter(c=>c.group==="club").length,5);
 assert.equal(COMPETITIONS.some(c=>c.code==="nba"),true);
 assert.equal(COMPETITIONS.some(c=>c.code==="uefa.nations"),true);
 assert.equal(COMPETITIONS.some(c=>c.code==="conmebol.america"),true);
});
test("watch fixtures are calendar-only events, stable IDs, not playable cards",()=>{
 const comp=COMPETITIONS[0];
 const raw={events:[{id:"401",date:"2026-11-10T03:00:00Z",competitions:[{competitors:[
  {homeAway:"home",team:{displayName:"LA Lakers"}},
  {homeAway:"away",team:{displayName:"Boston Celtics"}}
 ]}]}]};
 const x=parsedFixtures(raw,comp);
 assert.deepEqual(x.map(e=>e.id),["watch:nba:401"]);
 assert.equal(x[0].kind,"watch");
 assert.equal(x[0].teams[0],teamLabel(comp,"LA Lakers"));
 assert.equal(x[0].startUtc,"2026-11-10T03:00:00.000Z");
});
test("catalogue reads published full team names",()=>{
 const opts=parsedTeams({sports:[{leagues:[{teams:[{team:{displayName:"Chelsea"}}]}]}]},COMPETITIONS[1]);
 assert.deepEqual(opts,["Premier League · Chelsea"]);
});

test("published monthly fixtures map event team IDs to selectable canonical names", () => {
  const comp = COMPETITIONS[0];
  const teams = new Map([["13", "NBA · Los Angeles Lakers"],
    ["2", "NBA · Boston Celtics"]]);
  const input = { events: [{
    id: "402", date: "2026-11-10T03:00:00Z",
    competitions: [{ competitors: [
      { homeAway: "home", team: { id: "13", displayName: "LA Lakers" } },
      { homeAway: "away", team: { id: "2", displayName: "Boston" } },
    ] }],
  }] };
  const [match] = parsedFixtures(input, comp, teams);
  assert.deepEqual(match.teams, ["NBA · Los Angeles Lakers", "NBA · Boston Celtics"]);
  // 03:00 UTC falls on the previous Pacific calendar date.
  assert.equal(match.date, "2026-11-09");
});

test("only published US broadcasters survive geo and unrelated overseas sources", () => {
  const event = {
    competitions: [{
      broadcasts: [{market:{type:"National"},names:["Prime Video","ESPN","Sky Sports"]}],
      geoBroadcasts: [
        {country:{code:"GB"}, media:{shortName:"TNT"}},
        {country:{code:"US"}, media:{shortName:"NBA TV"}},
      ],
    }],
  };
  assert.deepEqual(publishedUsBroadcasts(event), ["Prime Video","ESPN","NBA TV"]);
});
test("broadcast assignments accompany indexed match and absent broadcasts stay unknown", () => {
  const c = COMPETITIONS[0];
  const event = { id:"tv1",date:"2026-10-30T23:00:00Z",
    competitions:[{ competitors:[
      {homeAway:"home",team:{displayName:"Lakers"}},
      {homeAway:"away",team:{displayName:"Celtics"}},
    ], broadcasts:[{names:["ESPN","Prime Video"]}]}] };
  const [match] = parsedFixtures({events:[event]}, c);
  assert.deepEqual(match.broadcasts, ["ESPN","Prime Video"]);
  delete event.competitions[0].broadcasts;
  assert.deepEqual(parsedFixtures({events:[event]},c)[0].broadcasts, []);
});

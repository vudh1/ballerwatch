import test from "node:test";
import assert from "node:assert/strict";
import { publishedUsBroadcasts } from "../../../backend/sports/broadcasts.mjs";
import { confirmedPrimeVideoNba, withPublishedPrimeVideo } from "../../../backend/sports/prime-video.mjs";
import { DROGON_CHANNELS, DROGON_TEST_CHANNELS, matchDrogonChannels } from "../../../backend/sports/drogon-lineup.mjs";
import { COMPETITIONS, teamLabel, parsedFixtures, parsedTeams, refreshUpcomingBroadcasts, watchCompetitionCode, prioritizedTeamOptions } from "../../../backend/sports/index.mjs";
test("NBA, top five European football leagues, UEFA and CONMEBOL represented", () => {
 assert.equal(COMPETITIONS.filter(c=>c.group==="club").length,5);
 assert.deepEqual(COMPETITIONS.filter(c=>c.group==="cup").map(c=>c.code),
   ["eng.league_cup", "eng.fa", "eng.charity", "esp.copa_del_rey",
    "esp.super_cup", "uefa.champions", "uefa.europa", "uefa.europa.conf",
    "uefa.super_cup", "fifa.cwc", "fifa.intercontinental_cup"]);
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
  assert.deepEqual(match.drogonChannels, ["ESPN"]);
  delete event.competitions[0].broadcasts;
  assert.deepEqual(parsedFixtures({events:[event]},c)[0].broadcasts, []);
  assert.deepEqual(parsedFixtures({events:[event]},c)[0].drogonChannels, []);
});

test("daily broadcasts update known near-term fixture without clearing original index", async () => {
  const today = new Date("2026-10-25T12:00:00Z");
  const old = {
    updatedAt:"2026-10-20T12:00:00Z",teams:["NBA · Lakers"],
    games:[{id:"watch:nba:daily1",kind:"watch",startUtc:"2026-10-29T01:00:00Z",
      date:"2026-10-28",broadcasts:[],teams:["NBA · Lakers"]}],
  };
  const event = {id:"daily1",date:"2026-10-29T01:00:00Z",
    competitions:[{competitors:[
      {homeAway:"home",team:{displayName:"Lakers"}},
      {homeAway:"away",team:{displayName:"Celtics"}},
    ],broadcasts:[{names:["Prime Video"]}]}]};
  const fetcher = async url => ({ok:true,text:async()=>JSON.stringify({
    events:url.includes("/basketball/nba/") ? [event] : [],
  })});
  const result = await refreshUpcomingBroadcasts(fetcher,today,old);
  assert.deepEqual(result.games[0].broadcasts, ["Prime Video"]);
  assert.deepEqual(result.games[0].drogonChannels, []);
  assert.equal(result.updatedAt,old.updatedAt);
  assert.equal(result.broadcastUpdatedAt,today.toISOString());
  assert.equal(result.broadcastCoverage.changed,1);
});
test("do not treat soccer Prime listings outside the US as US Prime games", () => {
  assert.deepEqual(publishedUsBroadcasts({competitions:[{
    broadcasts:[{names:["Prime Video"]}],
  }]}, COMPETITIONS[1]), []);
});

test("Drogon inventory preserves every public channel name but excludes TEST from matches", () => {
  assert.equal(DROGON_CHANNELS.length, 138);
  assert.equal(DROGON_TEST_CHANNELS.length, 8);
  assert.equal(new Set([...DROGON_CHANNELS, ...DROGON_TEST_CHANNELS]).size, 146);
  for (const name of ["ESPN", "ESPN 2", "NBCSN", "Fox Soccer Plus",
    "CBS Sports Golazo", "Sky Sports Premier League", "NZ Sky Sport Premier League", "WWE Channel"]) {
    assert.ok(DROGON_CHANNELS.includes(name), name);
  }
  assert.ok(DROGON_TEST_CHANNELS.includes("Fox Sports 501"));
  assert.deepEqual(matchDrogonChannels(["ESPN2", "FS1", "NBA TV", "CBS Sports Network"]),
    ["ESPN 2", "Fox Sports 1", "NBA TV", "CBS Sports"]);
  assert.deepEqual(matchDrogonChannels(["FOX Sports", "NBC Sports", "ESPN+", "Peacock",
    "Paramount+", "Prime Video", "Fox Sports 501", "Sky Sports"]), []);
  assert.deepEqual(matchDrogonChannels(undefined), []);
});

test("daily refresh replaces outdated lineup matches when broadcaster changes", async () => {
  const today = new Date("2026-10-25T12:00:00Z");
  const prior = {
    updatedAt: "2026-10-20T00:00:00Z",
    teams: ["NBA · Lakers"],
    games: [{
      id: "watch:nba:daily3", kind: "watch", date: "2026-10-28",
      startUtc: "2026-10-29T01:00:00Z", broadcasts: ["NBA TV"],
      drogonChannels: ["NBA TV"], teams: ["NBA · Lakers"],
    }],
  };
  const event = { id: "daily3", date: "2026-10-29T01:00:00Z",
    competitions: [{ competitors: [
      { homeAway: "home", team: { displayName: "Lakers" } },
      { homeAway: "away", team: { displayName: "Celtics" } },
    ], broadcasts: [{names:["Prime Video"]}] }] };
  const fetcher = async url => ({ ok: true, text: async () => JSON.stringify({
    events: url.includes("/basketball/nba/") ? [event] : [],
  }) });
  const result = await refreshUpcomingBroadcasts(fetcher, today, prior);
  assert.deepEqual(result.games[0].broadcasts, ["Prime Video"]);
  assert.deepEqual(result.games[0].drogonChannels, []);
  assert.equal(result.drogonLineupCapturedAt, "2026-10-25");
  assert.equal(result.broadcastCoverage.changed, 1);
});

test("official NBA Prime Video schedule supplements absent ESPN channel listings", () => {
  const nba = COMPETITIONS[0];
  const make = (date, away, home) => ({events:[{
    id: "prime-official-1", date, competitions:[{competitors:[
      {homeAway:"away",team:{displayName:away}},
      {homeAway:"home",team:{displayName:home}},
    ]}],
  }]});
  // Oct 30 official NBA Cup fixture is Knicks @ 76ers on Prime Video.
  const [prime] = parsedFixtures(
    make("2026-10-30T23:30:00Z","New York Knicks","Philadelphia 76ers"), nba);
  assert.equal(confirmedPrimeVideoNba(prime), true);
  assert.deepEqual(prime.broadcasts, ["Prime Video"]);
  assert.deepEqual(prime.drogonChannels, []);
  assert.equal(prime.drogonBroadcastKey, JSON.stringify(prime.broadcasts));
  // A separate Friday NBA match must never be guessed from Prime rights.
  const [ordinary] = parsedFixtures(
    make("2026-10-30T23:30:00Z","Boston Celtics","Philadelphia 76ers"), nba);
  assert.deepEqual(ordinary.broadcasts, []);
  assert.equal(confirmedPrimeVideoNba(ordinary), false);
  // Published right exists only for NBA: not a similarly named soccer match.
  assert.deepEqual(withPublishedPrimeVideo({...prime,sport:"soccer"}).broadcasts,["Prime Video"]);
});

test("NBA Prime match matching uses U.S. Eastern fixture date, not Pacific date", () => {
  // A published Jan 7, 2027 Thursday Prime game can be Jan 8 in UTC.
  const official = {kind:"watch",sport:"basketball",competition:"NBA",
    teams:["NBA · Boston Celtics","NBA · Los Angeles Lakers"],
    startUtc:"2027-01-08T03:00:00Z",broadcasts:[]};
  assert.equal(confirmedPrimeVideoNba(official), true);
  assert.deepEqual(withPublishedPrimeVideo(official).broadcasts,["Prime Video"]);
  assert.deepEqual(withPublishedPrimeVideo(withPublishedPrimeVideo(official)).broadcasts,
    ["Prime Video"]);
});

test("European cup fixtures preserve real competition names and unique source IDs", () => {
  for (const code of ["uefa.champions", "uefa.europa", "eng.league_cup", "uefa.nations"]) {
    const comp = COMPETITIONS.find(entry => entry.code === code);
    const [match] = parsedFixtures({ events: [{
      id: "401", date: "2026-11-04T20:00:00Z",
      competitions: [{ competitors: [
        { homeAway: "home", team: { displayName: code === "uefa.nations" ? "France" : "Arsenal" } },
        { homeAway: "away", team: { displayName: code === "uefa.nations" ? "Germany" : "Benfica" } },
      ] }],
    }] }, comp);
    assert.equal(match.competition, comp.label);
    assert.equal(match.id, "watch:" + code + ":401");
    assert.equal(match.teams[0], teamLabel(comp, code === "uefa.nations" ? "France" : "Arsenal"));
  }
});

test("EFL Cup indexed as distinct source-qualified fixtures; domestic league retained", () => {
  const comp = COMPETITIONS.find(entry => entry.code === "eng.league_cup");
  assert.deepEqual(comp, { sport: "soccer", code: "eng.league_cup", label: "EFL Cup", group: "cup" });
  const fixtures = parsedFixtures({events:[{
    id: "401999991", date: "2026-10-28T20:00:00Z",
    competitions:[{competitors:[
      {homeAway:"home",team:{displayName:"Liverpool"}},
      {homeAway:"away",team:{displayName:"Chelsea"}},
    ]}],
  }]}, comp);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].competition, "EFL Cup");
  assert.equal(fixtures[0].id, "watch:eng.league_cup:401999991");
  assert.deepEqual(fixtures[0].teams, ["EFL Cup · Liverpool", "EFL Cup · Chelsea"]);
  assert.ok(COMPETITIONS.some(entry => entry.code === "eng.1"));
});

test("smoke gate source ID parser accepts ESPN underscores and rejects malformed slugs", () => {
  assert.equal(watchCompetitionCode("watch:eng.league_cup:401999991"), "eng.league_cup");
  assert.equal(watchCompetitionCode("watch:uefa.champions:401"), "uefa.champions");
  assert.equal(watchCompetitionCode("watch:eng.1:123"), "eng.1");
  assert.equal(watchCompetitionCode("watch:nba:401"), "nba");
  for (const bad of ["watch:eng/leaguecup:1", "watch::401", "league:eng.1:10", ""]) {
    assert.equal(watchCompetitionCode(bad), "");
  }
});

test("new club trophies retain competition names, stable IDs and national World Cup isolation", () => {
  const cups = new Map([
    ["fifa.cwc", "FIFA Club World Cup"],
    ["fifa.intercontinental_cup", "FIFA Intercontinental Cup"],
    ["uefa.super_cup", "UEFA Super Cup"],
    ["uefa.europa.conf", "UEFA Conference League"],
    ["eng.charity", "FA Community Shield"],
    ["esp.super_cup", "Supercopa de España"],
    ["esp.copa_del_rey", "Copa del Rey"],
    ["eng.fa", "FA Cup"],
  ]);
  assert.equal(new Set(COMPETITIONS.map(x => x.code)).size, COMPETITIONS.length);
  for (const [code, label] of cups) {
    const comp = COMPETITIONS.find(c => c.code === code);
    assert.ok(comp, code);
    assert.equal(comp.group, "cup");
    assert.equal(comp.label, label);
    const [game] = parsedFixtures({ events: [{
      id: "999", date: "2026-12-21T22:30:00Z",
      competitions: [{ competitors: [
        { homeAway: "home", team: { displayName: "Arsenal" } },
        { homeAway: "away", team: { displayName: "Chelsea" } },
      ] }],
    }] }, comp);
    assert.equal(game.id, "watch:" + code + ":999");
    assert.equal(watchCompetitionCode(game.id), code);
    assert.equal(game.competition, label);
    assert.equal(game.kind, "watch");
    assert.deepEqual(game.teams, [label + " · Arsenal", label + " · Chelsea"]);
  }
  assert.equal(COMPETITIONS.find(c => c.code === "fifa.world").group, "national");
  assert.equal(teamLabel(COMPETITIONS.find(c => c.code === "fifa.world"), "England"),
    "National · England");
});

test("cup-only opponents cannot displace established watched club choices", () => {
  const core = new Set(["NBA · Lakers", "Premier League · Arsenal",
    "La Liga · Real Madrid", "National · England"]);
  const all = new Set([...core,
    ...Array.from({length: 740}, (_, i) => "FA Cup · Amateur " + String(i).padStart(4, "0"))]);
  const options = prioritizedTeamOptions(core, all, ["Premier League · Manchester City"]);
  assert.equal(options.length, 700);
  for (const name of [...core, "Premier League · Manchester City"]) {
    assert.ok(options.includes(name), name);
  }
  assert.ok(options.some(name => name.startsWith("FA Cup · ")));
  assert.equal(new Set(options).size, options.length);
});

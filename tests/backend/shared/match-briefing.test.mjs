import test from "node:test";
import assert from "node:assert/strict";
import { weeklyMatchBriefing } from "../../../backend/shared/match-briefing.mjs";
import { directIntent } from "../../../backend/infra/web-worker/worker.mjs";

test("AI 8 weekly briefing uses public schedules and RSVP capacity, not private rosters", () => {
  const result = weeklyMatchBriefing({
    pickups:[
      {date:"2099-10-10", reserved:12, capacity:16, field:"Synthetic Match Field",
        players:[{name:"Private RSVP Name"}]},
      {date:"2099-10-12", reserved:3, capacity:16, field:"Other Field"},
      {date:"2099-10-20", reserved:16, capacity:16, field:"Out of window"},
    ],
    leagueGames:[{
      date:"2099-10-11",team:"Supermokh FC",opponent:"PhoSaiGon",
      startTime:"19:00",location:"Walt Hundley - Mod South",
      jerseyColor:"Green",
    }],
    startDate:"2099-10-09",endDate:"2099-10-15",
  });
  assert.match(result.reply,/Supermokh FC vs PhoSaiGon/);
  assert.match(result.reply,/12\/16 booked \(75%, 4 left\) · Filling up/);
  assert.match(result.reply,/3\/16 booked/);
  assert.doesNotMatch(result.reply,/Private RSVP Name|Out of window/);
  assert.match(result.reply,/No attendance or match-outcome predictions/);
});

test("AI 8 weekly briefing does not interpret unavailable capacity as empty or full", () => {
  const result=weeklyMatchBriefing({
    pickups:[{date:"2099-10-10",reserved:0,capacity:null}],
    startDate:"2099-10-09",endDate:"2099-10-15",
  });
  assert.match(result.reply,/capacity pending/);
  assert.doesNotMatch(result.reply,/FULL|0\/0 booked/);
});

test("AI 8 can answer an empty briefing honestly", () => {
  const result=weeklyMatchBriefing({
    startDate:"2099-10-09",endDate:"2099-10-15",
  });
  assert.match(result.reply,/No published pickup or monitored RATS match/);
});

test("briefing phrasing routes before generic schedule and RSVP keywords", () => {
  assert.equal(directIntent("Brief me on this week"),"briefing");
  assert.equal(directIntent("Which pickup is filling up?"),"briefing");
  assert.equal(directIntent("Give me a weekly summary"),"briefing");
  assert.equal(directIntent("/version"),"version");
  assert.equal(directIntent("What's my next game?"),"next_game");
});

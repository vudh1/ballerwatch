import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_MATCH_EDITS_KEY, readLocalMatchEdits, setLocalMatchOverride,
  clearLocalMatchOverride, setLocalMatchHidden, applyLocalMatchEdits,
} from "../../frontend/web/lib/local-match-edits.js";

function device() {
  const values=new Map();
  return {getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value),
    removeItem:key=>values.delete(key)};
}
const game = {
  id:"league:v2:alpha",kind:"league",date:"2099-10-15",
  dateLabel:"Thu 10/15",startTime:"19:00",endTime:"21:00",
  time:"7:00 PM–9:00 PM",location:"Published RATS Field",
  mapsQuery:"Published RATS Field",
  locationUrl:"https://maps.google.com/?q=original",
  coordinates:{latitude:47.6,longitude:-122.3},
  sourceDate:"2099-10-15",sourceLocation:"Published RATS Field",
};
const calendar={startDate:"2099-10-14",updatedAt:"2099-10-14T00:00:00Z",
  games:[game,{...game,id:"league:v2:beta",date:"2099-10-17"}]};
const label=date=>"date:"+date;

test("match corrections are device-local, persist without TTL and preserve source identity",()=>{
  const one=device(),two=device();
  assert.equal(setLocalMatchOverride(one,{id:game.id,date:"2099-10-18",
    startTime:"20:00",endTime:"22:00",location:"My Field"},
  new Date("2026-10-16T10:00:00Z")),true);
  const personal=applyLocalMatchEdits(calendar,readLocalMatchEdits(one),label);
  assert.equal(personal.games[1].id,game.id);
  assert.equal(personal.games[1].date,"2099-10-18");
  assert.equal(personal.games[1].dateLabel,"date:2099-10-18");
  assert.equal(personal.games[1].location,"My Field");
  assert.equal(personal.games[1].coordinates,null);
  assert.equal(personal.games[1].locationUrl,"");
  assert.equal(personal.games[1].sourceDate,game.sourceDate);
  assert.equal(personal.games[1].deviceOverride,true);
  assert.equal(calendar.games[0].location,"Published RATS Field");
  assert.equal(applyLocalMatchEdits(calendar,readLocalMatchEdits(two),label).games[0].location,
    "Published RATS Field");
  assert.ok(one.getItem(LOCAL_MATCH_EDITS_KEY));
  assert.equal(clearLocalMatchOverride(one,game.id),true);
  assert.equal(applyLocalMatchEdits(calendar,readLocalMatchEdits(one),label).games[0].date,
    "2099-10-15");
});

test("hide and restore affect only the local carousel and calendar",()=>{
  const one=device(),two=device();
  assert.equal(setLocalMatchHidden(one,game,true),true);
  const shown=applyLocalMatchEdits(calendar,readLocalMatchEdits(one),label);
  assert.deepEqual(shown.games.map(x=>x.id),["league:v2:beta"]);
  assert.equal(applyLocalMatchEdits(calendar,readLocalMatchEdits(two),label).games.length,2);
  assert.equal(setLocalMatchHidden(one,{id:game.id},false),true);
  assert.equal(applyLocalMatchEdits(calendar,readLocalMatchEdits(one),label).games.length,2);
});

test("malformed or unsafe overrides never write or change canonical games",()=>{
  const s=device();
  for(const input of [
    {id:"../../forbidden",date:"2099-10-18",startTime:"20:00"},
    {id:game.id,date:"2099-02-30",startTime:"20:00"},
    {id:game.id,date:"2099-10-15",startTime:"25:00"},
  ]) assert.equal(setLocalMatchOverride(s,input),false);
  assert.deepEqual(applyLocalMatchEdits(calendar,readLocalMatchEdits(s),label).games,calendar.games);
  s.setItem(LOCAL_MATCH_EDITS_KEY,"{malformed");
  assert.equal(readLocalMatchEdits(s).overrides[game.id],undefined);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureLiveLeagueVenues, captureVenueEvents, captureVenueObservations, readVenues } from "../../../backend/league/venue-cache.mjs";

test("source-published URLs grow the durable encrypted venue cache without replacement", t => {
  const previous = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "venue-test-key-not-production";
  t.after(()=>{if (previous === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previous;});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"ballerwatch-venue-cache-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,"venues.json");
  const event={location:"Queen Anne Bowl Playfield Soccer",
    venue:{url:"https://seattlerats.org/venue/queen-anne-bowl-playfield-soccer/"}};
  assert.equal(captureVenueEvents([event],file).added,1);
  const raw=fs.readFileSync(file,"utf8");
  assert.doesNotMatch(raw,/Queen Anne Bowl Playfield Soccer/);
  assert.equal(JSON.parse(raw).kdf,"hmac-sha256-v1");
  assert.equal(readVenues(file).venues[0].url,event.venue.url);
  assert.equal(captureVenueObservations([{
    name:event.location,url:"https://www.google.com/maps?q=47.6,-122.3",
  }],file).enriched,1);
  assert.equal(readVenues(file).venues[0].url,event.venue.url);
  assert.equal(readVenues(file).venues[0].mapUrl,"https://www.google.com/maps?q=47.6,-122.3");
  assert.equal(captureVenueEvents([{location:"Another Soccer Field"}],file).added,1);
  assert.equal(readVenues(file).venues.length,2);
});

test("new fixture venues are checked once then direct RATS Maps links are cached encrypted", async t => {
  const previous = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "venue-site-test-key-not-production";
  t.after(() => {
    if (previous === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previous;
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-venue-discovery-"));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const cacheFile = path.join(dir, "venues.json");
  const scheduleFile = path.join(dir, "schedule.json");
  fs.writeFileSync(scheduleFile, JSON.stringify({
    ok: true, teams: [{matches:[
      {location:"Walt Hundley Playfield - Mod South"},
      {location:"Walt Hundley Playfield - Mod North"},
    ]}],
  }));
  const SOUTH = "https://maps.app.goo.gl/southMod";
  const NORTH = "https://maps.app.goo.gl/northMod";
  let visits = 0;
  const fetchImpl = async url => {
    visits++;
    const label = url.includes("mod-south") ? "Mod South" : "Mod North";
    const map = label === "Mod South" ? SOUTH : NORTH;
    return {ok:true,headers:{get:()=> "text/html"},
      text:async () => '<h1>Walt Hundley Playfield - ' + label +
        '</h1><a href="' + map + '">Directions</a>'};
  };
  const options = {fetchImpl, now:new Date("2026-10-08T21:00:00Z")};
  const first = await captureLiveLeagueVenues(cacheFile, scheduleFile, options);
  assert.equal(first.added, 2);
  assert.equal(first.enriched, 4);
  assert.equal(visits, 2);
  const stored = fs.readFileSync(cacheFile, "utf8");
  assert.doesNotMatch(stored, /Walt Hundley|southMod|northMod/);
  const south = readVenues(cacheFile).venues.find(v => /South/.test(v.name));
  const north = readVenues(cacheFile).venues.find(v => /North/.test(v.name));
  assert.equal(south.mapUrl, SOUTH);
  assert.equal(north.mapUrl, NORTH);
  assert.notEqual(south.mapUrl, north.mapUrl);

  await captureLiveLeagueVenues(cacheFile, scheduleFile, options);
  assert.equal(visits, 2, "verified destinations do not trigger more website fetches");

  fs.writeFileSync(scheduleFile, JSON.stringify({ok:true,teams:[{matches:[
    {location:"Walt Hundley Playfield - Mod South"},
    {location:"Walt Hundley Playfield - Mod North"},
    {location:"Queen Anne Bowl Playfield Soccer"},
  ]}]}));
  await captureLiveLeagueVenues(cacheFile, scheduleFile, {
    fetchImpl: async () => { visits++; throw new Error("RATS is temporarily down"); },
    now:new Date("2026-10-08T23:00:00Z"),
  });
  assert.equal(visits, 3, "only the new field was queried");
  assert.equal(readVenues(cacheFile).venues.length, 3);
  assert.ok(readVenues(cacheFile).venues.find(v => /Queen Anne/.test(v.name)).discoveryCheckedAt);
});

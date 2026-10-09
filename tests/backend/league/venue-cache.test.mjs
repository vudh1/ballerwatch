import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureVenueEvents, captureVenueObservations, readVenues } from "../../../backend/league/venue-cache.mjs";

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
  }],file).enriched,0);
  assert.equal(readVenues(file).venues[0].url,event.venue.url);
  assert.equal(captureVenueEvents([{location:"Another Soccer Field"}],file).added,1);
  assert.equal(readVenues(file).venues.length,2);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encryptState, decryptState, isHardenedStateEnvelope } from "../../../backend/shared/state-crypto.mjs";
import { projectRatsScouting, scoutingSeasonId, scoutingFixtures } from "../../../backend/league/scouting.mjs";

test("independent scorer stores a fully encrypted snapshot and leaves unchanged data intact", t => {
  const priorKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-scouting-projection-unit-test-key";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-scout-"));
  t.after(() => {
    if (priorKey == null) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = priorKey;
    fs.rmSync(dir, {recursive:true,force:true});
  });
  const history = {
    updatedAt: "2026-10-13T00:00:00Z",
    coverage: {complete: true},
    seasons: [{
      seasonId: "fall-2026", label: "Fall 2026",
      teams: [
        {name:"Synthetic A",day:"Tuesday",gender:"Coed",division:"3",leagueName:"11v11"},
        {name:"Synthetic B",day:"Tuesday",gender:"Coed",division:"3",leagueName:"11v11"},
      ],
      matches: [
        {date:"2026-10-10",homeTeam:"Synthetic A",awayTeam:"Synthetic B",
          homeScore:2,awayScore:1},
      ],
    }],
  };
  const schedule = {seasonId:"fall-2026",teams:[
    {name:"Synthetic A",matches:[{date:"2026-10-25",opponent:"Synthetic B"}]},
  ]};
  const h=path.join(dir,"history.json");
  const l=path.join(dir,"schedule.json");
  const o=path.join(dir,"scouting.json");
  fs.writeFileSync(h,JSON.stringify(encryptState(history)));
  fs.writeFileSync(l,JSON.stringify(encryptState(schedule)));
  assert.equal(scoutingSeasonId(history,schedule),"fall-2026");
  assert.equal(scoutingFixtures(schedule).length,1);
  const result=projectRatsScouting({
    historyFile:h,scheduleFile:l,outputFile:o,
    now:new Date("2026-10-13T12:00:00Z"),
  });
  assert.equal(result.changed,true);
  assert.equal(result.reports,2);
  const raw=fs.readFileSync(o,"utf8");
  assert.doesNotMatch(raw,/Synthetic A|Synthetic B|scout/);
  assert.equal(isHardenedStateEnvelope(JSON.parse(raw)),true);
  const payload=decryptState(JSON.parse(raw));
  assert.equal(payload.seasonId,"fall-2026");
  assert.ok(Object.keys(payload.matchups).length>=1);
  const same=projectRatsScouting({
    historyFile:h,scheduleFile:l,outputFile:o,
    now:new Date("2026-10-13T12:01:00Z"),
  });
  assert.equal(same.changed,false);
  assert.equal(fs.readFileSync(o,"utf8"),raw);
  // New fixture pairings require republishing without new scores.
  const modified={...schedule, teams:[...schedule.teams,
    {name:"Synthetic B",matches:[{date:"2026-10-26",opponent:"Synthetic A"}]}]};
  fs.writeFileSync(l,JSON.stringify(encryptState(modified)));
  const updated=projectRatsScouting({
    historyFile:h,scheduleFile:l,outputFile:o,
    now:new Date("2026-10-13T12:02:00Z"),
  });
  assert.equal(updated.changed,true);
});

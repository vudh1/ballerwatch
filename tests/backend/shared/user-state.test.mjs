import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadUserSettings, saveUserState, USER_STATE_PATH }
  from "../../../backend/shared/user-state.mjs";
import { isEncryptedStateEnvelope } from "../../../backend/shared/state-crypto.mjs";

test("encrypted accountless state excludes users and cross-device profiles",t=>{
  const cwd=process.cwd(),env=process.env;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ballerwatch-user-state-"));
  process.chdir(dir);
  process.env={...env,TRACKER_STATE_KEY:"synthetic-user-state-key"};
  t.after(()=>{
    process.chdir(cwd);process.env=env;
    fs.rmSync(dir,{recursive:true,force:true});
  });
  assert.equal(saveUserState({
    ownerRsvpName:"Synthetic User",
    webUsers:{teammate:{rsvpName:"Private Teammate"}},
    notificationProfiles:{admin:{readIds:["a"]}},
    webOwnerPassword:{digest:"keep-protected-maintenance"},
  }),true);
  const envelope=JSON.parse(fs.readFileSync(USER_STATE_PATH,"utf8"));
  assert.equal(isEncryptedStateEnvelope(envelope),true);
  const settings=loadUserSettings();
  assert.equal(settings.ownerRsvpName,"");
  assert.deepEqual(settings.webUsers,{});
  assert.deepEqual(settings.notificationProfiles,{});
  assert.equal(settings.webOwnerPassword.digest,"keep-protected-maintenance");
  assert.doesNotMatch(JSON.stringify(settings),/Synthetic User|Private Teammate/);
});

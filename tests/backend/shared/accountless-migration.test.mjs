import test from "node:test";
import assert from "node:assert/strict";
import { scrubAccountRecords, scrubPushIdentity } from "../../../backend/shared/accountless-migration.mjs";

test("migration removes ordinary accounts and profiles but protects operator privileges",()=>{
  const cleaned=scrubAccountRecords({settings:{
    webUsers:{teammate:{webPassword:{digest:"private"}}},
    notificationProfiles:{teammate:{readIds:["x"]}},
    ownerRsvpName:"Secret Name",webOwnerPassword:{digest:"admin-safe"},
    matchOverrides:{"league:test":{date:"2026-10-20"}},
    hiddenMatches:{},
  }});
  assert.deepEqual(cleaned.settings.webUsers,{});
  assert.deepEqual(cleaned.settings.notificationProfiles,{});
  assert.equal(cleaned.settings.ownerRsvpName,"");
  assert.deepEqual(cleaned.settings.webOwnerPassword,{digest:"admin-safe"});
  assert.doesNotMatch(JSON.stringify(cleaned),/teammate|Secret Name/);
});
test("legacy identities are scrubbed while provider-valid push subscriptions remain",()=>{
  const now=new Date("2026-10-16T08:00:00Z");
  const result=scrubPushIdentity({vapid:{privateJwk:{d:"test"}},subscriptions:[{
    endpoint:"https://web.push.apple.com/Q2/test",userId:"someone",
    keys:{auth:"auth"},channels:{pickup:true,league:false}
  }]},now);
  assert.equal(result.subscriptions.length,1);
  assert.equal(result.subscriptions[0].userId,undefined);
  assert.equal(result.subscriptions[0].expiresAt,undefined);
  assert.equal(result.subscriptions[0].channels.league,false);
});

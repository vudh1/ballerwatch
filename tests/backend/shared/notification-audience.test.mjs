import assert from "node:assert/strict";
import test from "node:test";
import { pickupNotificationAudience, leagueNotificationAudience }
  from "../../../backend/shared/notification-audience.mjs";
import { buildRsvpNameIndex, nameTag }
  from "../../../backend/shared/rsvp-name-index.mjs";

const secret="synthetic-secret-for-test";
const roster={"2026-10-15":{
  players:[{name:"Alex   Green"}],waitlist:[{name:"Robin Blue"}],
}};
const index=buildRsvpNameIndex(roster,new Date("2026-10-15T00:00:00Z"),secret);
const confirmed={rsvpTag:nameTag(" alex green ",secret)};
const waitlisted={rsvpTag:nameTag("Robin Blue",secret)};
const anonymous={};
const rsvp={tag:"pickup-rsvp-reminder-2026-10-15"};
const capacity={tag:"pickup-capacity-2026-10-15-16"};
const kickoff={tag:"pickup-start-reminder-2026-10-15"};

test("private HMAC index suppresses redundant booked-device RSVP alerts",()=>{
  assert.equal(pickupNotificationAudience(rsvp,confirmed,index),false);
  assert.equal(pickupNotificationAudience(capacity,confirmed,index),false);
  assert.equal(pickupNotificationAudience(kickoff,confirmed,index),true);
  assert.equal(pickupNotificationAudience(rsvp,waitlisted,index),false);
  assert.equal(pickupNotificationAudience(capacity,waitlisted,index),true);
});
test("unknown guest name or unavailable roster never hides a reminder",()=>{
  assert.equal(pickupNotificationAudience(rsvp,anonymous,index),true);
  assert.equal(pickupNotificationAudience(rsvp,{rsvpTag:nameTag("Unknown",secret)},index),true);
  assert.equal(pickupNotificationAudience(rsvp,confirmed,null),true);
  assert.doesNotMatch(JSON.stringify(index),/Alex Green|Robin Blue/i);
});
test("league push audience follows each device's chosen teams",()=>{
  const alert={channel:"league",teams:["Thunder FC","Blue Hawks"]};
  assert.equal(leagueNotificationAudience(alert,{teams:["Blue Hawks"]}),true);
  assert.equal(leagueNotificationAudience(alert,{teams:["Other FC"]}),false);
  assert.equal(leagueNotificationAudience(alert,{teams:[]}),true);
});

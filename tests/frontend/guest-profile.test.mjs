import test from "node:test";
import assert from "node:assert/strict";
import { readGuestProfile, saveGuestProfile, normalizeGuestProfile } from "../../frontend/web/lib/guest-profile.js";
import { readLocalNotificationChannels, saveLocalNotificationChannels } from "../../frontend/web/lib/notification-state.js";
const storage = () => { const m=new Map(); return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}; };
test("anonymous visitor preferences are device-local and capped", () => {
  const s=storage();
  assert.deepEqual(readGuestProfile(s),{name:"",teams:[]});
  assert.equal(saveGuestProfile(s,{name:" Hello ",teams:["Fixture FC","fixture fc","Test United"]}),true);
  assert.deepEqual(readGuestProfile(s),{name:"Hello",teams:["Fixture FC","Test United"]});
  assert.equal(normalizeGuestProfile({teams:Array.from({length:12},(_,i)=>"Team "+i)}).teams.length,8);
});
test("RSVP name and monitored teams remain until this device changes them", () => {
  const s=storage();
  assert.equal(saveGuestProfile(s,{name:"Private Name",teams:["Test FC"]}),true);
  assert.equal(readGuestProfile(s,Date.parse("2026-10-16T08:00:00Z")).name,"Private Name");
  assert.deepEqual(readGuestProfile(s,Date.parse("2035-10-16T08:00:00Z")).teams,["Test FC"]);
  assert.equal(saveGuestProfile(s,{name:"Other Name",teams:["New FC"]}),true);
  assert.deepEqual(readGuestProfile(s),{name:"Other Name",teams:["New FC"]});
});

test("migration preserves the prior 24-hour cache even if its old lease expired",()=>{
  const s=storage();
  s.setItem("ballerwatch-visitor-profile-v1-24h",JSON.stringify({
    schema:1,expiresAt:Date.parse("2026-10-16T08:00:00Z"),
    data:{name:"Original RSVP",teams:["Original FC"]},
  }));
  assert.deepEqual(readGuestProfile(s),{name:"Original RSVP",teams:["Original FC"]});
  assert.equal(s.getItem("ballerwatch-visitor-profile-v1-24h"),null);
  assert.deepEqual(readGuestProfile(s),{name:"Original RSVP",teams:["Original FC"]});
});

test("legacy pre-11 accountless preferences migrate into persistent storage",()=>{
  const s=storage();
  s.setItem("ballerwatch-visitor-profile-v1",JSON.stringify({
    name:"Before 11",teams:["Old FC"],
  }));
  assert.deepEqual(readGuestProfile(s),{name:"Before 11",teams:["Old FC"]});
  assert.equal(s.getItem("ballerwatch-visitor-profile-v1"),null);
});
test("guest notification channels persist on device", () => {
  const s=storage();
  assert.deepEqual(readLocalNotificationChannels(s),{pickup:true,league:true,version:true});
  assert.equal(saveLocalNotificationChannels(s,{pickup:false,league:true,version:false}),true);
  assert.deepEqual(readLocalNotificationChannels(s),{pickup:false,league:true,version:false});
});

test("notification categories persist despite old 24h lease expiration",()=>{
  const s=storage();
  s.setItem("ballerwatch-notification-channels-v1-24h",JSON.stringify({
    schema:1,expiresAt:1,data:{channels:{pickup:false,league:true,version:false}},
  }));
  assert.deepEqual(readLocalNotificationChannels(s),{
    pickup:false,league:true,version:false,
  });
  assert.equal(s.getItem("ballerwatch-notification-channels-v1-24h"),null);
  assert.ok(s.getItem("ballerwatch-notification-channels-v2"));
  assert.equal(saveLocalNotificationChannels(s,{pickup:true,league:false,version:true}),true);
  assert.deepEqual(readLocalNotificationChannels(s),{
    pickup:true,league:false,version:true,
  });
});

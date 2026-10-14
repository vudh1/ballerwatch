import test from "node:test";
import assert from "node:assert/strict";
import { readGuestProfile, saveGuestProfile, normalizeGuestProfile } from "../../frontend/web/lib/guest-profile.js";
import { readLocalNotificationChannels, saveLocalNotificationChannels } from "../../frontend/web/lib/notification-state.js";
const storage = () => { const m=new Map(); return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}; };
test("anonymous visitor preferences are device-local and capped", () => {
  const s=storage();
  assert.deepEqual(readGuestProfile(s),{name:"",teams:[]});
  assert.equal(saveGuestProfile(s,{name:" Hello ",teams:["Fixture FC","fixture fc","Test United"]}),true);
  assert.deepEqual(readGuestProfile(s),{name:"Hello",teams:["Fixture FC","Test United"]});
  assert.equal(normalizeGuestProfile({teams:Array.from({length:12},(_,i)=>"Team "+i)}).teams.length,8);
});
test("guest notification channels persist on device", () => {
  const s=storage();
  assert.deepEqual(readLocalNotificationChannels(s),{pickup:true,league:true,version:true});
  assert.equal(saveLocalNotificationChannels(s,{pickup:false,league:true,version:false}),true);
  assert.deepEqual(readLocalNotificationChannels(s),{pickup:false,league:true,version:false});
});

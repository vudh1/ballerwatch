import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  approvedPublicAppsScript, livePublicMemberNames, namesFromEncryptedCatalog,
  parsePublicMembersJsonp, publicMemberNames,
} from "../../../../backend/infra/web-worker/rsvp-members.mjs";

const members = [
  { name: "Member Alpha", venmo: "@private-payment", messenger: "private-chat", zelle: "private-phone" },
  { name: "Member Beta", note: "private-note" },
  { name: "member   alpha", venmo: "duplicate" },
];

test("all-member projection strips every contact, payment and attendance field", () => {
  const result = publicMemberNames(members);
  assert.deepEqual(result, ["member alpha", "Member Beta"]);
  assert.doesNotMatch(JSON.stringify(result), /private-payment|private-chat|private-phone|private-note/);
  assert.deepEqual(publicMemberNames([{name:"A Person"}, {name:"Bad\nName"}]), ["A Person"]);
  assert.throws(() => publicMemberNames([]));
  assert.throws(() => publicMemberNames([{name:"x".repeat(300)}]));
  assert.throws(() => publicMemberNames(Array.from({length:2001},()=>({name:"A Person"}))));
});

test("encrypted member snapshot only serves valid, recent name-only catalog", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  const catalog = { schema:1, refreshedAt:"2026-10-25T00:00:00Z", names:["Member Alpha"] };
  assert.deepEqual(namesFromEncryptedCatalog(catalog, now), ["Member Alpha"]);
  assert.throws(() => namesFromEncryptedCatalog({...catalog, schema:2}, now));
  assert.throws(() => namesFromEncryptedCatalog({...catalog, refreshedAt:"2026-08-01T00:00:00Z"},now));
  assert.throws(() => namesFromEncryptedCatalog({...catalog, names:[]},now));
});

test("upstream listRoster JSONP strictly checks callback, size and response", () => {
  const callback="ballerwatchMembers";
  assert.deepEqual(parsePublicMembersJsonp(callback+"("+JSON.stringify({ok:true,roster:members})+");"),
    ["member alpha","Member Beta"]);
  for (const body of ["alert(1)", "nope({});", callback+"({});", "x".repeat(512001)]) {
    assert.throws(() => parsePublicMembersJsonp(body));
  }
});

test("live bootstrap accepts only allowed public Apps Script URL and removes contacts", async () => {
  const source='const APPS_SCRIPT_URL =\n  "https://script.google.com/macros/s/test_id-3/exec";';
  const url=approvedPublicAppsScript(source);
  assert.match(url, /script.google.com\/macros\/s\/test_id-3\/exec\?action=listRoster&callback=ballerwatchMembers/);
  assert.throws(() => approvedPublicAppsScript('const APPS_SCRIPT_URL = "https://invalid.test/exec";'));
  const calls=[];
  const names=await livePublicMemberNames(async (href)=>{
    calls.push(href);
    return {ok:true,text:async()=>calls.length===1?source:
      "ballerwatchMembers("+JSON.stringify({ok:true,roster:members})+");"};
  });
  assert.equal(calls.length,2);
  assert.deepEqual(names,["member alpha","Member Beta"]);
  assert.doesNotMatch(JSON.stringify(names),/private-/);
});

test("Worker reads encrypted canonical record; frontend never reads raw directory", () => {
  const worker=fs.readFileSync("backend/infra/web-worker/worker.mjs","utf8");
  const app=fs.readFileSync("frontend/web/app.js","utf8");
  assert.match(worker,/decryptState\(record.value, env\)/);
  assert.match(worker,/githubStateRecord\(env, "pickup\/state\/roster-catalog.json"\)/);
  assert.match(worker,/url.pathname === "\/web\/rsvp-members"/);
  assert.match(app,/api\("\/web\/rsvp-members"/);
  assert.doesNotMatch(app,/ballerwatchMembers|listRoster|private-payment/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RSVP_ROSTER_CATALOG_PATH, rosterNamesOnly, parsePublicRosterResponse,
  privateRosterCatalog, fetchPublicRosterNames,
  refreshEncryptedRosterCatalog, readEncryptedRosterCatalog,
} from "../../../backend/pickup/roster-catalog.mjs";
import { decryptState, isHardenedStateEnvelope }
  from "../../../backend/shared/state-crypto.mjs";
import { runtimePathsFor, ALL_RUNTIME_FILE_PATHS }
  from "../../../backend/shared/runtime-paths.mjs";

const example = () => [
  {name:"Sample Player A", venmo:"private-payment", messenger:"private-account",
    note:"private-information", zelle:"private-zelle"},
  {name:"Sample Player B", venmo:"another-payment"},
  {name:" sample   player a ", note:"duplicate"},
];

test("roster projection keeps names only and strips every contact or payment field", () => {
  const names = rosterNamesOnly(example());
  assert.deepEqual(names, ["sample player a", "Sample Player B"]);
  const saved = privateRosterCatalog(names, new Date("2026-11-01T10:43:00Z"));
  assert.deepEqual(Object.keys(saved).sort(),
    ["names", "refreshedAt", "schema", "source"].sort());
  assert.deepEqual(saved.names, names);
  assert.equal(JSON.stringify(saved).includes("private-payment"), false);
  assert.equal(JSON.stringify(saved).includes("private-zelle"), false);
  assert.equal(JSON.stringify(saved).includes("private-account"), false);
});

test("public Apps Script JSONP parser fails closed on malformed, empty, unsafe, or oversized data", () => {
  assert.deepEqual(parsePublicRosterResponse(
    "ballerwatchMonthlyRoster(" + JSON.stringify({ok:true,roster:example()}) + ");"),
  ["sample player a", "Sample Player B"]);
  for (const content of [
    "alert('x')",
    "unexpected(" + JSON.stringify({ok:true,roster:example()}) + ");",
    "ballerwatchMonthlyRoster({\"ok\":false});",
    "ballerwatchMonthlyRoster({\"ok\":true,\"roster\":[]});",
    "a".repeat(512001),
  ]) assert.throws(() => parsePublicRosterResponse(content));
  assert.deepEqual(rosterNamesOnly([
    {name:"Accepted Member"}, {name:"Invalid\nName"}, {name:""},
  ]), ["Accepted Member"]);
});

test("fetch resolves public RSVP endpoint but never accepts other hosts or account URLs", async () => {
  const requests = [];
  const names = await fetchPublicRosterNames({
    discoverEndpoint: async () => "https://script.google.com/macros/s/fixture_id-2/exec",
    fetchImpl: async (url) => {
      requests.push(url);
      return {ok:true, text:async()=> "ballerwatchMonthlyRoster(" +
        JSON.stringify({ok:true,roster:example()}) + ");"};
    },
  });
  assert.deepEqual(names, ["sample player a", "Sample Player B"]);
  const url = new URL(requests[0]);
  assert.equal(url.origin, "https://script.google.com");
  assert.equal(url.searchParams.get("action"), "listRoster");
  assert.equal(url.searchParams.get("callback"), "ballerwatchMonthlyRoster");
  await assert.rejects(fetchPublicRosterNames({
    discoverEndpoint: async () => "https://example.org/private",
    fetchImpl: async () => { throw new Error("must not fetch"); },
  }));
});

test("encrypted monthly snapshot keeps contacts and names out of public tree and preserves previous state on failure", async () => {
  const previousKey = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-test-only-key-do-not-persist";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rsvp-private-catalog-"));
  const file = path.join(dir, "catalog.json");
  try {
    const result = await refreshEncryptedRosterCatalog({
      now: new Date("2026-11-01T10:43:00Z"),
      file,
      fetchNames: async () => rosterNamesOnly(example()),
    });
    assert.equal(result.memberCount, 2);
    const raw = fs.readFileSync(file, "utf8");
    const envelope = JSON.parse(raw);
    assert.equal(isHardenedStateEnvelope(envelope), true);
    for (const leaked of ["Sample Player B", "sample player a", "private-payment",
      "private-information", "private-zelle", "private-account"]) {
      assert.equal(raw.includes(leaked), false);
    }
    assert.deepEqual(readEncryptedRosterCatalog(file).names, ["sample player a", "Sample Player B"]);
    assert.equal(decryptState(envelope).schema, 1);
    await assert.rejects(refreshEncryptedRosterCatalog({
      file, fetchNames: async () => { throw new Error("upstream unavailable"); },
    }));
    assert.equal(fs.readFileSync(file, "utf8"), raw);
    await assert.rejects(refreshEncryptedRosterCatalog({
      file, fetchNames: async () => [],
    }));
    assert.equal(fs.readFileSync(file, "utf8"), raw);
  } finally {
    if (previousKey === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previousKey;
    fs.rmSync(dir, {recursive:true,force:true});
  }
});

test("monthly roster is its own encrypted-only scope and never a browser/web projection", () => {
  assert.deepEqual(runtimePathsFor("roster"), [RSVP_ROSTER_CATALOG_PATH]);
  assert.ok(ALL_RUNTIME_FILE_PATHS.includes(RSVP_ROSTER_CATALOG_PATH));
  assert.ok(!runtimePathsFor("web").includes(RSVP_ROSTER_CATALOG_PATH));
  assert.ok(!runtimePathsFor("pickup").includes(RSVP_ROSTER_CATALOG_PATH));
  const workflow = fs.readFileSync(".github/workflows/rsvp-roster-monthly.yml", "utf8");
  assert.match(workflow, /cron: '43 10 1 \* \*'/);
  assert.match(workflow, /ref: production/);
  assert.match(workflow, /pull roster/);
  assert.match(workflow, /push roster/);
  assert.match(workflow, /TRACKER_STATE_KEY/);
  assert.doesNotMatch(workflow, /send-pending|notify\.mjs|OWNER_RSVP_NAME|UPSTREAM_ENDPOINT/);
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  assert.doesNotMatch(html, /roster-catalog\.json|ballerwatchMonthlyRoster/);
});

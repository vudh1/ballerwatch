/**
 * Security regression for optional v1 calendar profile capabilities.
 * Uses ephemeral SQLite only; no live Cloudflare or private runtime records.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { handleCalendarProfileRequest, normalizeCalendarSelection } from
  "../../../../backend/infra/web-worker/calendar-profiles.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const origin = "https://vudh1.github.io";
const base = "https://ballerwatch-web.example.workers.dev";
const secret = Buffer.alloc(32, 73).toString("base64url");

function makeDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL(
    "../../../../backend/infra/web-worker/migrations/0001_calendar_profiles.sql",
    import.meta.url), "utf8"));
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...args) {
          const statement = sqlite.prepare(sql);
          return {
            async first() { return statement.get(...args) || null; },
            async run() { return statement.run(...args); },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const values = [];
        for (const statement of statements) values.push(await statement.run());
        sqlite.exec("COMMIT");
        return values;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
function harness() {
  const db = makeDatabase();
  const env = { CALENDAR_PROFILES: db, CALENDAR_SYNC_KEY: secret };
  let count = 0;
  async function call(path, method = "GET", body, token = "", options = {}) {
    const request = new Request(path.startsWith("http") ? path : base + path, {
      method, headers: {
        ...(options.noOrigin ? {} : { origin }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: "Bearer " + token } : {}),
        "cf-connecting-ip": options.ip || "203.0.113." + (count % 2 + 1),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    count += 1;
    const response = await handleCalendarProfileRequest(request, env,
      async (s) => `BEGIN:VCALENDAR\r\nX-SELECTION:${JSON.stringify(s)}\r\nEND:VCALENDAR\r\n`);
    const text = await response.text();
    return { code: response.status, headers: response.headers,
      json: response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null,
      text };
  }
  return { call, db, env };
}
const aSelection = { teams: ["Example FC"], watch: ["NBA · Example A"], pickup: true };
const bSelection = { teams: ["Other FC"], watch: ["NBA · Example B"], pickup: false };

test("validation bounds, duplicate removal, and strict pickup flag", () => {
  assert.deepEqual(normalizeCalendarSelection({
    teams: ["Example FC", "example fc"], watch: [], pickup: true,
  }), { teams: ["Example FC"], watch: [], pickup: true });
  assert.throws(() => normalizeCalendarSelection({ teams: [], watch: [], pickup: "1" }), RangeError);
  assert.throws(() => normalizeCalendarSelection({ teams: ["a"], watch: [], pickup: true }), RangeError);
  assert.throws(() => normalizeCalendarSelection({
    teams: Array.from({ length: 9 }, (_, i) => "Team " + i), watch: [], pickup: true,
  }), RangeError);
});

test("profiles isolate writes, preserve stable links across updates, and hide preferences at rest", async () => {
  const { call, db } = harness();
  const a = (await call("/web/v1/calendar-profiles", "POST",
    { optIn: true, selection: aSelection })).json;
  const b = (await call("/web/v1/calendar-profiles", "POST",
    { optIn: true, selection: bSelection })).json;
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.url, b.url);
  assert.notEqual(a.manager, b.manager);
  const raw = db.sqlite.prepare("SELECT selection_cipher, read_cipher FROM calendar_profiles WHERE id = ?").get(a.id);
  assert.ok(!JSON.stringify(raw).includes("Example FC"));
  assert.ok(!JSON.stringify(raw).includes(a.url.split("/").at(-1)));
  const beforeA = await call(a.url);
  assert.equal(beforeA.code, 200);
  assert.match(beforeA.text, /Example FC/);
  assert.equal(beforeA.headers.get("cache-control"), "no-store");
  const selection2 = { teams: ["New City FC"], watch: ["NBA · Example C"], pickup: false };
  const changed = await call("/web/v1/calendar-profiles/" + a.id + "/selection",
    "PUT", { revision: 1, selection: selection2 }, a.manager);
  assert.equal(changed.code, 200);
  assert.equal(changed.json.revision, 2);
  const afterA = await call(a.url);
  assert.equal(afterA.code, 200);
  assert.match(afterA.text, /New City FC/);
  assert.doesNotMatch(afterA.text, /Example FC/);
  const afterB = await call(b.url);
  assert.match(afterB.text, /Other FC/);
  assert.equal((await call("/web/v1/calendar-profiles/" + b.id + "/selection", "PUT",
    { revision: 1, selection: selection2 }, a.manager)).code, 404);
  assert.equal((await call("/web/v1/calendar-profiles/" + a.id + "/selection", "PUT",
    { revision: 1, selection: aSelection }, a.manager)).code, 409);
  assert.equal((await call("/web/v1/calendar-profiles/" + a.id + "/selection", "PUT",
    { revision: 2, selection: aSelection }, a.manager, { noOrigin: true })).code, 403);
  const info = (await call("/web/v1/calendar-profiles/" + a.id, "GET", undefined, a.manager)).json;
  assert.equal(info.revision, 2);
  assert.equal(info.url, a.url);
  assert.deepEqual(info.selection, selection2);
  assert.equal((await call("/web/v1/calendar-profiles/" + a.id, "GET", undefined,
    b.manager)).code, 404);
});

test("one-use pairing creates independent device credentials; recovery rotates once", async () => {
  const { call } = harness();
  const created = (await call("/web/v1/calendar-profiles", "POST",
    { optIn: true, selection: aSelection })).json;
  const path = "/web/v1/calendar-profiles/" + created.id;
  const pairing = (await call(path + "/pairings", "POST", undefined, created.manager)).json;
  assert.equal(pairing.code.length, 43);
  assert.ok(pairing.expiresAt > Date.now());
  const linked = await call("/web/v1/calendar-pairings/redeem", "POST", { code: pairing.code });
  assert.equal(linked.code, 200);
  assert.notEqual(linked.json.manager, created.manager);
  assert.equal(linked.json.id, created.id);
  assert.equal((await call("/web/v1/calendar-pairings/redeem", "POST",
    { code: pairing.code })).code, 404);
  assert.equal((await call(path, "GET", undefined, linked.json.manager)).code, 200);
  assert.equal((await call(path + "/device", "DELETE", undefined, linked.json.manager)).code, 200);
  assert.equal((await call(path, "GET", undefined, linked.json.manager)).code, 404);
  assert.equal((await call(path, "GET", undefined, created.manager)).code, 200);
  const reset = (await call(path + "/recovery", "POST", undefined, created.manager)).json;
  assert.equal(reset.recoveryCode.length, 43);
  assert.notEqual(reset.recoveryCode, created.recoveryCode);
  assert.equal((await call("/web/v1/calendar-profiles/recover", "POST",
    { recoveryCode: created.recoveryCode })).code, 404);
  const recovery = await call("/web/v1/calendar-profiles/recover",
    "POST", { recoveryCode: reset.recoveryCode });
  assert.equal(recovery.code, 200);
  assert.notEqual(recovery.json.recoveryCode, reset.recoveryCode);
  assert.equal((await call("/web/v1/calendar-profiles/recover", "POST",
    { recoveryCode: created.recoveryCode })).code, 404);
  assert.equal((await call(path, "GET", undefined, recovery.json.manager)).code, 200);
  await call(path + "/other-devices", "POST", undefined, created.manager);
  assert.equal((await call(path, "GET", undefined, recovery.json.manager)).code, 404);
});

test("rotation revokes old ICS and full deletion revokes all capabilities", async () => {
  const { call } = harness();
  const created = (await call("/web/v1/calendar-profiles", "POST",
    { optIn: true, selection: aSelection })).json;
  const path = "/web/v1/calendar-profiles/" + created.id;
  const rotated = (await call(path + "/rotate", "POST", undefined, created.manager)).json;
  assert.notEqual(rotated.url, created.url);
  assert.equal((await call(created.url)).code, 404);
  assert.equal((await call(rotated.url)).code, 200);
  assert.equal((await call(path, "DELETE", undefined, created.manager)).code, 200);
  assert.equal((await call(rotated.url)).code, 404);
  assert.equal((await call(path, "GET", undefined, created.manager)).code, 404);
  assert.equal((await call("/web/v1/calendar-profiles/recover", "POST",
    { recoveryCode: created.recoveryCode })).code, 404);
});

test("pairing expiry, malformed requests and disabled Cloudflare fail closed", async () => {
  const { call, db, env } = harness();
  assert.equal((await call("/web/v1/calendar-profiles", "POST",
    { optIn: false, selection: aSelection })).code, 400);
  const created = (await call("/web/v1/calendar-profiles", "POST",
    { optIn: true, selection: aSelection })).json;
  const pair = (await call("/web/v1/calendar-profiles/" + created.id + "/pairings",
    "POST", undefined, created.manager)).json;
  db.sqlite.prepare("UPDATE calendar_pairings SET expires_ms = 1").run();
  assert.equal((await call("/web/v1/calendar-pairings/redeem", "POST",
    { code: pair.code })).code, 404);
  assert.equal((await call("/web/v1/calendar-profiles", "POST",
    { optIn: true, selection: aSelection }, "", { noOrigin: true })).code, 403);
  assert.equal((await call("/web/v1/calendar-ics/not-a-token.ics")).code, 404);
  const disabled = await handleCalendarProfileRequest(new Request(
    base + "/web/v1/calendar-profiles/status"), {}, async () => "");
  assert.deepEqual(await disabled.json(), { ok: true, available: false });
  const broken = await handleCalendarProfileRequest(new Request(
    base + "/web/v1/calendar-profiles/status"), { CALENDAR_PROFILES: env.CALENDAR_PROFILES }, async () => "");
  assert.equal((await broken.json()).available, false);
});

test("daily request budget prevents excessive anonymous mutations", async () => {
  const { call } = harness();
  let limited = false;
  for (let i = 0; i < 175; i++) {
    const result = await call("/web/v1/calendar-pairings/redeem", "POST",
      { code: Buffer.alloc(32, i % 255).toString("base64url") },
      "", { ip: "198.51.100.20" });
    if (result.code === 429) { limited = true; break; }
  }
  assert.equal(limited, true);
});

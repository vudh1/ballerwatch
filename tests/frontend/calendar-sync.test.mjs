import test from "node:test";
import assert from "node:assert/strict";
import { createCalendarSync, readCalendarProfile, calendarSelection } from
  "../../frontend/web/lib/calendar-sync.js";

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
};
const id = "a".repeat(22), manager = "b".repeat(43);
const url = "https://ballerwatch-web.example.workers.dev/web/v1/calendar-ics/" + "c".repeat(43) + ".ics";

function server() {
  const remote = { teams: ["Test FC"], watch: ["NBA · Test"], pickup: true };
  let revision = 1, creates = 0, changes = 0;
  return {
    remote, get creates() { return creates; }, get changes() { return changes; },
    async request(path, opts) {
      if (path.endsWith("/status")) return { ok: true, available: true };
      if (path === "/web/v1/calendar-profiles" && opts.method === "POST") {
        creates += 1;
        Object.assign(remote, JSON.parse(opts.body).selection);
        return { ok: true, id, manager, url, recoveryCode: "d".repeat(43), revision };
      }
      if (path === "/web/v1/calendar-profiles/" + id && opts.method === "GET") {
        return { ok: true, id, revision, url, selection: structuredClone(remote) };
      }
      if (path.endsWith("/selection") && opts.method === "PUT") {
        const { selection, revision: expected } = JSON.parse(opts.body);
        if (expected !== revision) throw Object.assign(new Error("Conflict"), { status: 409 });
        Object.assign(remote, selection);
        revision += 1; changes += 1;
        return { ok: true, revision };
      }
      throw new Error("Unexpected request: " + path);
    },
  };
}

test("accountless calendar remains entirely local until explicit opt-in", async () => {
  const local = storage();
  const api = server();
  let current = { teams: ["Test FC"], watch: ["NBA · Test"], pickup: true };
  const states = [];
  const sync = createCalendarSync({
    storage: local, key: "calendar", request: api.request,
    getSelection: () => current, applySelection: value => { current = value; },
    onState: value => states.push(value), confirm: () => false,
  });
  await sync.status();
  assert.equal(api.creates, 0);
  await sync.enable();
  assert.equal(api.creates, 0);
  assert.equal(local.getItem("calendar"), null);
  assert.equal(sync.state(), null);
  assert.equal(states.at(-1).connected, false);
});

test("selected teams update stable read-only URL without replacing it", async () => {
  const local = storage();
  const api = server();
  let current = { teams: ["Test FC"], watch: ["NBA · Test"], pickup: true };
  const sync = createCalendarSync({
    storage: local, key: "calendar", request: api.request,
    getSelection: () => current, applySelection: value => { current = value; },
    confirm: () => true,
  });
  await sync.status();
  await sync.enable();
  assert.equal(api.creates, 1);
  assert.equal(sync.state().url, url);
  current = { teams: ["Updated FC"], watch: ["NBA · Test"], pickup: false };
  await sync.update();
  assert.equal(api.changes, 1);
  assert.equal(sync.state().revision, 2);
  assert.deepEqual(api.remote, current);
  assert.equal(sync.state().url, url);
  const persisted = readCalendarProfile(local, "calendar");
  assert.equal(persisted.url, url);
  assert.equal(persisted.manager, manager);
  assert.ok(!JSON.stringify(persisted).includes("recoveryCode"));
});

test("new device cannot silently claim or overwrite another profile", async () => {
  const local = storage();
  const api = server();
  let current = calendarSelection(["Other FC"], [], false);
  let confirmations = 0;
  const sync = createCalendarSync({
    storage: local, key: "calendar", request: api.request,
    getSelection: () => current, applySelection: value => { current = value; },
    confirm: () => { confirmations += 1; return false; },
  });
  await sync.status();
  assert.deepEqual(current.teams, ["Other FC"]);
  assert.equal(sync.state(), null);
  await sync.link("p".repeat(43));
  assert.ok(confirmations >= 1);
  assert.equal(local.getItem("calendar"), null);
  assert.deepEqual(current.teams, ["Other FC"]);
});

test("invalid or malformed persisted credentials are not accepted", () => {
  const s = storage();
  s.setItem("calendar", '{"schema":1,"id":"not-an-id","manager":"token"}');
  assert.equal(readCalendarProfile(s, "calendar"), null);
});

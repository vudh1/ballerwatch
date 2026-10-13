import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("backend/league/google_apps_script/Code.gs", "utf8");

function loadBridge() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context;
}

test("existing tracked Calendar event is updated instead of duplicated", () => {
  const bridge = loadBridge();
  const calls = [];
  const event = {
    getId: () => "event-1",
    setTitle: (value) => calls.push(["setTitle", value]),
    setTime: (start, end) => calls.push(["setTime", start.toISOString(), end.toISOString()]),
    setLocation: (value) => calls.push(["setLocation", value]),
    setDescription: (value) => calls.push(["setDescription", value]),
    removeAllReminders: () => calls.push(["removeAllReminders"]),
    addPopupReminder: (minutes) => calls.push(["addPopupReminder", minutes]),
  };
  let createCount = 0;
  const calendar = {
    getEventById: (id) => {
      assert.equal(id, "event-1");
      return event;
    },
    createEvent: () => {
      createCount += 1;
      return event;
    },
    getEvents: () => [],
  };
  const stored = new Map([["rats_event_v2:test", "event-1"]]);
  const props = {
    getProperty: (key) => stored.get(key) || null,
    setProperty: (key, value) => stored.set(key, value),
    deleteProperty: (key) => stored.delete(key),
  };
  const item = {
    key: "v2:test",
    match: {
      team: "Team Alpha",
      opponent: "Opponent",
      homeAway: "away",
      start: "2026-10-05T19:30:00-07:00",
      end: "2026-10-05T20:30:00-07:00",
      location: "Updated Field",
      jerseyColor: "Black",
      opponentJerseyColor: "White",
      division: "Monday Men's D-3 8v8",
      season: "Fall 2026",
      fieldNotes: "Updated field notes",
      sourceUrl: "https://example.invalid/source",
      mapUrl: "https://example.invalid/map",
      endEstimated: false,
    },
  };

  const result = bridge.applyUpdate_(calendar, props, item);

  assert.equal(result.ok, true);
  assert.equal(result.action, "updated");
  assert.equal(createCount, 0);
  assert.ok(calls.some(([name]) => name === "setTime"));
  assert.ok(calls.some(([name, value]) => name === "setLocation" && value === "Updated Field"));
  assert.equal(stored.get("rats_event_v2:test"), "event-1");
});


test("estimated league end description uses two-hour duration", () => {
  assert.match(source, /estimated two-hour duration/);
  assert.doesNotMatch(source, /estimated one-hour duration/);
});

test("explicit deletion removes only the tracked BallerWatch Calendar event", () => {
  const bridge = loadBridge();
  let removed = 0;
  const saved = new Map([["rats_event_v2:deleted", "managed-event"]]);
  const props = {
    getProperty: (key) => saved.get(key) || null,
    deleteProperty: (key) => saved.delete(key),
  };
  const calendar = {
    getEventById: (id) => {
      assert.equal(id, "managed-event");
      return {deleteEvent: () => { removed += 1; }};
    },
  };
  const result = bridge.applyUpdate_(calendar, props, {
    type: "deleted", key: "v2:deleted",
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "deleted");
  assert.equal(removed, 1);
  assert.equal(saved.size, 0);

  const repeated = bridge.applyUpdate_(calendar, props, {
    type: "deleted", key: "v2:deleted",
  });
  assert.equal(repeated.action, "already-absent");
  assert.equal(removed, 1);
});

test("untracked Google Calendar events are never guessed and deleted", () => {
  const bridge = loadBridge();
  let lookedUp = 0;
  const props = {getProperty: () => null};
  const calendar = {getEventById: () => { lookedUp += 1; }};
  const result = bridge.applyUpdate_(calendar, props, {
    type: "deleted", key: "v2:untracked",
    previous: {team: "Team Alpha", opponent: "Opponent"},
  });
  assert.equal(result.action, "already-absent");
  assert.equal(lookedUp, 0);
});

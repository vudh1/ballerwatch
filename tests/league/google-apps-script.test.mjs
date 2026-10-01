import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("league/google_apps_script/Code.gs", "utf8");

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

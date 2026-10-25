import test from "node:test";
import assert from "node:assert/strict";
import { completeFirstRun, isFirstRunDevice, needsFirstRun } from
  "../../frontend/web/lib/first-run.js";

function storage(initial = {}) {
  const records = new Map(Object.entries(initial));
  return {
    getItem: key => records.has(key) ? records.get(key) : null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: key => { records.delete(key); },
  };
}

test("new device sees setup once, even if it skips every step", () => {
  const state = storage();
  assert.equal(isFirstRunDevice(state, "setup", ["old-device-profile"]), true);
  assert.equal(completeFirstRun(state, "setup"), true);
  assert.equal(needsFirstRun(state, "setup"), false);
  assert.equal(isFirstRunDevice(state, "setup", []), false);
});

test("existing profile or cached public fixtures prevent surprise setup", () => {
  const savedName = storage({ "device-profile": "{}" });
  assert.equal(isFirstRunDevice(savedName, "setup", ["device-profile"]), false);
  const noPrefsButPreviouslyVisited = storage({ "public-cache": "{}" });
  assert.equal(isFirstRunDevice(noPrefsButPreviouslyVisited, "setup", ["public-cache"]), false);
});

test("storage failures never trap visitors in non-dismissable setup", () => {
  const broken = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(needsFirstRun(broken, "setup"), false);
  assert.equal(isFirstRunDevice(broken, "setup", []), false);
  assert.equal(completeFirstRun(broken, "setup"), false);
});

test("first-run markup has three optional choices and a Settings recovery hint", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../../frontend/web/index.html", import.meta.url), "utf8");
  for (const step of ["name", "teams", "watch"]) {
    assert.match(html, new RegExp('id="setup-' + step + '-choice"'));
    assert.match(html, new RegExp('id="setup-' + step + '-options"'));
  }
  for (const name of ["setup-skip", "setup-next", "setup-back", "setup-missing-note",
    "guest-name-trigger", "guest-name-clear"]) {
    assert.ok(html.includes('id="' + name + '"'), name);
  }
  assert.doesNotMatch(html, /id="guest-name" type="text"/);
});

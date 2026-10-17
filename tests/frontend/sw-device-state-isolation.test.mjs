/**
 * Ensure upgrading one installed PWA never erases another app's local push
 * preferences, badges or RSVP suppression state. Synthetic CacheStorage only;
 * never reads or sends real push subscriptions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const workerSource = fs.readFileSync("frontend/web/sw.js", "utf8");
const cacheNames = [
  "ballerwatch-v11-1-0-shell",
  "ballerwatch-v11-2-0-shell",
  "ballerwatch-v2-v9-1-2-shell",
  "ballerwatch-beta-old-shell",
  "ballerwatch-device-state-v1",
  "ballerwatch-device-state-v2",
  "ballerwatch-v2-device-state-v1",
  "ballerwatch-v2-device-state-v2",
  "ballerwatch-beta-device-state-v1",
];

async function activate(pathname) {
  const active = new Set(cacheNames);
  const listeners = {};
  const context = {
    URL,
    caches: {
      keys: async () => [...active],
      delete: async (key) => active.delete(key),
    },
    self: {
      location: { pathname, href: "https://example.test" + pathname },
      navigator: {},
      clients: { claim: async () => {} },
      addEventListener: (name, handler) => { listeners[name] = handler; },
    },
  };
  vm.runInNewContext(workerSource, context, { filename: "sw.js" });
  let completion = null;
  listeners.activate({ waitUntil: (promise) => { completion = promise; } });
  assert.ok(completion, "The worker must wait for scoped cache cleanup");
  await completion;
  return active;
}

test("production activation keeps beta and legacy device preferences", async () => {
  const names = await activate("/ballerwatch/sw.js");
  assert.ok(names.has("ballerwatch-device-state-v2"));
  assert.ok(!names.has("ballerwatch-device-state-v1"));
  assert.ok(names.has("ballerwatch-v2-device-state-v1"));
  assert.ok(names.has("ballerwatch-beta-device-state-v1"));
  assert.ok(names.has("ballerwatch-beta-old-shell"));
});

test("beta activation keeps production and legacy device preferences", async () => {
  const names = await activate("/ballerwatch/beta/sw.js");
  assert.ok(names.has("ballerwatch-device-state-v2"));
  assert.ok(names.has("ballerwatch-v2-device-state-v2"));
  assert.ok(!names.has("ballerwatch-beta-device-state-v1"));
  assert.ok(names.has("ballerwatch-v11-2-0-shell"));
});

test("legacy activation keeps production and beta device preferences", async () => {
  const names = await activate("/ballerwatch/v2/sw.js");
  assert.ok(names.has("ballerwatch-device-state-v1"));
  assert.ok(names.has("ballerwatch-beta-device-state-v1"));
  assert.ok(!names.has("ballerwatch-v2-device-state-v1"));
  assert.ok(names.has("ballerwatch-beta-old-shell"));
});

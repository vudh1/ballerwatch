import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { encryptState } from "../../shared/state-crypto.mjs";
import {
  applyEncryptedRegistrationEventB64,
  buildVapidAuthorization,
  ensureWebPushState,
  loadWebPushState,
  publicWebPushConfig,
  sendWebPushSignals,
} from "../../shared/web-push.mjs";

function inTempDir(t) {
  const cwd = process.cwd();
  const env = process.env;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-web-push-"));
  process.chdir(dir);
  process.env = { ...env, TRACKER_STATE_KEY: "synthetic-web-push-test-key" };
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test("creates encrypted VAPID state and exposes only the public application key", (t) => {
  inTempDir(t);
  const state = ensureWebPushState();
  const config = publicWebPushConfig();

  assert.equal(config.ready, true);
  assert.ok(config.applicationServerKey.length > 80);
  assert.equal(config.subscriptionCount, 0);
  assert.ok(state.vapid.privateJwk.d);
  assert.doesNotMatch(fs.readFileSync("state/web-push.json", "utf8"), /privateJwk|"d":/);
});

test("applies encrypted subscribe and unsubscribe registration events", (t) => {
  inTempDir(t);
  ensureWebPushState();
  const subscription = {
    endpoint: "https://push.example.test/subscription-1",
    expirationTime: null,
    keys: { p256dh: "public-key", auth: "auth-key" },
  };

  const subscribe = Buffer.from(JSON.stringify(encryptState({
    action: "subscribe",
    subscription,
  }))).toString("base64");
  applyEncryptedRegistrationEventB64(subscribe);
  assert.equal(loadWebPushState().subscriptions.length, 1);

  const unsubscribe = Buffer.from(JSON.stringify(encryptState({
    action: "unsubscribe",
    subscription,
  }))).toString("base64");
  applyEncryptedRegistrationEventB64(unsubscribe);
  assert.equal(loadWebPushState().subscriptions.length, 0);
});

test("builds RFC 8292 VAPID authorization and prunes stale endpoints", async (t) => {
  inTempDir(t);
  const state = ensureWebPushState();
  state.subscriptions = [
    {
      endpoint: "https://push.example.test/subscription-1",
      expirationTime: null,
      keys: { p256dh: "x", auth: "y" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  fs.writeFileSync(
    "state/web-push.json",
    JSON.stringify(encryptState(state), null, 2) + "\n",
  );

  const auth = buildVapidAuthorization(
    state,
    state.subscriptions[0].endpoint,
    { now: new Date("2026-10-01T20:00:00Z") },
  );
  assert.match(auth, /^vapid t=[^.]+\.[^.]+\.[^,]+, k=/);

  const result = await sendWebPushSignals({
    now: new Date("2026-10-01T20:00:00Z"),
    fetchImpl: async (_url, options) => {
      assert.match(options.headers.Authorization, /^vapid t=/);
      assert.equal(options.headers.TTL, "60");
      return { ok: false, status: 410 };
    },
  });
  assert.deepEqual(result, { sent: 0, stale: 1, failed: 0 });
  assert.equal(loadWebPushState().subscriptions.length, 0);
});

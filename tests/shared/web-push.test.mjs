import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { encryptState } from "../../shared/state-crypto.mjs";
import {
  isUnsafeWebPushAddress,
  applyEncryptedRegistrationEventB64,
  buildVapidAuthorization,
  ensureWebPushState,
  loadWebPushState,
  publicWebPushConfig,
  sendWebPushSignals,
  validateWebPushDestination,
} from "../../shared/web-push.mjs";
import {
  normalizeWebPushEndpoint,
  validWebPushEndpoint,
} from "../../shared/web-push-endpoint.mjs";

const MOZILLA_ENDPOINT =
  "https://updates.push.services.mozilla.com/wpush/v2/synthetic-subscription";

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

function writeSubscriptionState(subscription) {
  const state = ensureWebPushState();
  state.subscriptions = [{
    expirationTime: null,
    keys: { p256dh: "x", auth: "y" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...subscription,
  }];
  fs.writeFileSync(
    "state/web-push.json",
    JSON.stringify(encryptState(state), null, 2) + "\n",
  );
  return state;
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

test("accepts only recognized browser push service endpoints", () => {
  const valid = [
    MOZILLA_ENDPOINT,
    "https://fcm.googleapis.com/fcm/send/synthetic",
    "https://web.push.apple.com/Q2/synthetic",
    "https://wns2-par02p.notify.windows.com/w/?token=synthetic",
  ];
  for (const endpoint of valid) {
    assert.equal(validWebPushEndpoint(endpoint), normalizeWebPushEndpoint(endpoint));
  }

  const invalid = [
    "http://updates.push.services.mozilla.com/wpush/v2/test",
    "https://127.0.0.1/push",
    "https://[::1]/push",
    "https://169.254.169.254/latest/meta-data/",
    "https://user:pass@updates.push.services.mozilla.com/wpush/v2/test",
    "https://updates.push.services.mozilla.com:8443/wpush/v2/test",
    "https://updates.push.services.mozilla.com.evil.example/push",
    "https://example.com/push",
  ];
  for (const endpoint of invalid) assert.equal(validWebPushEndpoint(endpoint), "");
});

test("rejects private, loopback, link-local, multicast, and documentation addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isUnsafeWebPushAddress(address), true, address);
  }
  assert.equal(isUnsafeWebPushAddress("34.120.0.1"), false);
  assert.equal(isUnsafeWebPushAddress("2607:f8b0:4005:805::200e"), false);
});

test("applies encrypted subscribe and unsubscribe registration events", (t) => {
  inTempDir(t);
  ensureWebPushState();
  const subscription = {
    endpoint: MOZILLA_ENDPOINT,
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

test("builds RFC 8292 VAPID authorization and disables redirects", async (t) => {
  inTempDir(t);
  const state = writeSubscriptionState({ endpoint: MOZILLA_ENDPOINT });

  const auth = buildVapidAuthorization(
    state,
    state.subscriptions[0].endpoint,
    { now: new Date("2026-10-01T20:00:00Z") },
  );
  assert.match(auth, /^vapid t=[^.]+\.[^.]+\.[^,]+, k=/);

  const result = await sendWebPushSignals({
    now: new Date("2026-10-01T20:00:00Z"),
    resolveHost: async () => [{ address: "34.120.0.1", family: 4 }],
    fetchImpl: async (url, options) => {
      assert.equal(url, MOZILLA_ENDPOINT);
      assert.equal(options.redirect, "error");
      assert.match(options.headers.Authorization, /^vapid t=/);
      assert.equal(options.headers.TTL, "60");
      return { ok: false, status: 410 };
    },
  });
  assert.deepEqual(result, { sent: 0, stale: 1, failed: 0 });
  assert.equal(loadWebPushState().subscriptions.length, 0);
});

test("redirect responses fail closed without following or rewriting the target", async (t) => {
  inTempDir(t);
  writeSubscriptionState({ endpoint: MOZILLA_ENDPOINT });
  let calls = 0;

  const result = await sendWebPushSignals({
    resolveHost: async () => [{ address: "34.120.0.1", family: 4 }],
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.redirect, "error");
      throw new TypeError("redirect mode is set to error");
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, { sent: 0, stale: 0, failed: 1 });
  assert.equal(loadWebPushState().subscriptions.length, 1);
});

test("rejects unsafe DNS answers before any outbound request", async (t) => {
  inTempDir(t);
  writeSubscriptionState({ endpoint: MOZILLA_ENDPOINT });
  let fetched = false;

  const result = await sendWebPushSignals({
    resolveHost: async () => [{ address: "169.254.169.254", family: 4 }],
    fetchImpl: async () => {
      fetched = true;
      return { ok: true, status: 201 };
    },
  });

  assert.equal(fetched, false);
  assert.deepEqual(result, { sent: 0, stale: 1, failed: 1 });
  assert.equal(loadWebPushState().subscriptions.length, 0);
});

test("rejects mixed public/private DNS answers to resist rebinding", async () => {
  await assert.rejects(
    validateWebPushDestination(MOZILLA_ENDPOINT, {
      resolveHost: async () => [
        { address: "34.120.0.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    }),
    /non-public address/,
  );
});

test("validates all DNS answers for a recognized public endpoint", async () => {
  assert.equal(
    await validateWebPushDestination(MOZILLA_ENDPOINT, {
      resolveHost: async () => [
        { address: "34.120.0.1", family: 4 },
        { address: "2607:f8b0:4005:805::200e", family: 6 },
      ],
    }),
    MOZILLA_ENDPOINT,
  );
});

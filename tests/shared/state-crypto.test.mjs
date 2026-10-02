import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  decryptState,
  encryptState,
  isEncryptedStateEnvelope,
  isHardenedStateEnvelope,
  stateEnvelopeNeedsReseal,
} from "../../shared/state-crypto.mjs";

function legacyEncrypt(secret, value) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

test("runtime encryption uses a dedicated KDF domain and retains migration reads", (t) => {
  const previous = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = "synthetic-domain-separation-master-key";
  t.after(() => {
    if (previous === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previous;
  });

  const value = { synthetic: true, nested: { value: 42 } };
  const hardened = encryptState(value);
  assert.equal(hardened.kdf, "hmac-sha256-v1");
  assert.equal(isEncryptedStateEnvelope(hardened), true);
  assert.equal(isHardenedStateEnvelope(hardened), true);
  assert.equal(stateEnvelopeNeedsReseal(hardened), false);
  assert.deepEqual(decryptState(hardened), value);

  const legacy = legacyEncrypt(process.env.TRACKER_STATE_KEY, value);
  assert.equal(isEncryptedStateEnvelope(legacy), true);
  assert.equal(isHardenedStateEnvelope(legacy), false);
  assert.equal(stateEnvelopeNeedsReseal(legacy), true);
  assert.deepEqual(decryptState(legacy), value);
});

/**
 * Defines and identifies the AES-GCM envelope used by every runtime-state file.
 *
 * v5.8.2 derives the encryption key in a dedicated cryptographic domain while
 * retaining read compatibility with legacy envelopes so deployment can reseal
 * existing runtime state without losing data.
 */
import crypto from "node:crypto";
import { KEY_CONTEXT } from "./security-contexts.mjs";

const KDF_ID = "hmac-sha256-v1";

function masterSecret() {
  const value = (process.env.TRACKER_STATE_KEY || "").trim();
  if (!value) throw new Error("TRACKER_STATE_KEY is required.");
  return Buffer.from(value, "utf8");
}

function legacySecret() {
  return crypto.createHash("sha256").update(masterSecret()).digest();
}

function derivedSecret() {
  return crypto
    .createHmac("sha256", masterSecret())
    .update(KEY_CONTEXT.stateEncryption)
    .digest();
}

export function isEncryptedStateEnvelope(value) {
  return Boolean(
    value &&
    value.v === 1 &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.data === "string" &&
    (value.kdf === undefined || value.kdf === KDF_ID),
  );
}

export function isHardenedStateEnvelope(value) {
  return isEncryptedStateEnvelope(value) && value.kdf === KDF_ID;
}

export function stateEnvelopeNeedsReseal(value) {
  return isEncryptedStateEnvelope(value) && !isHardenedStateEnvelope(value);
}

export function encryptState(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedSecret(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  return {
    v: 1,
    kdf: KDF_ID,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptState(payload) {
  try {
    if (!isEncryptedStateEnvelope(payload)) return null;
    const key = payload.kdf === KDF_ID ? derivedSecret() : legacySecret();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.data, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return null;
  }
}

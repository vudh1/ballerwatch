/**
 * Defines and identifies the AES-GCM envelope used by every runtime-state file.
 *
 * Documentation baseline: v5.8.0. Runtime/private data must never be committed
 * to Git outside a complete authenticated-encryption envelope.
 */
import crypto from "node:crypto";

function secret() {
  const value = (process.env.TRACKER_STATE_KEY || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!value) throw new Error("TRACKER_STATE_KEY or TELEGRAM_BOT_TOKEN is required.");
  return crypto.createHash("sha256").update(value).digest();
}

export function isEncryptedStateEnvelope(value) {
  return Boolean(
    value &&
    value.v === 1 &&
    typeof value.iv === "string" &&
    typeof value.tag === "string" &&
    typeof value.data === "string",
  );
}

export function encryptState(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secret(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptState(payload) {
  try {
    if (!isEncryptedStateEnvelope(payload)) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      secret(),
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

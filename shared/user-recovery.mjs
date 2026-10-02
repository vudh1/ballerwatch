/**
 * Resets the BallerWatch web user password from a temporary GitHub Actions secret.
 *
 * Recovery never prints or stores the plaintext password. Set the repository
 * secret BALLERWATCH_RECOVERY_PASSWORD, run the manual reset workflow, then
 * delete/rotate that secret.
 */
import crypto from "node:crypto";
import { KEY_CONTEXT } from "./security-contexts.mjs";
import { loadUserState, saveUserState } from "./user-state.mjs";

function required(name) {
  const value = String(process.env[name] || "");
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePassword(value) {
  const password = String(value ?? "");
  if (password.length < 12 || password.length > 200) {
    throw new Error("Recovery password must be between 12 and 200 characters.");
  }
  return password;
}

function derivedKey(master, context) {
  return crypto
    .createHmac("sha256", Buffer.from(master, "utf8"))
    .update(context)
    .digest();
}

function passwordRecord(master, password) {
  const salt = crypto.randomBytes(18).toString("base64url");
  const digest = crypto
    .createHmac("sha256", derivedKey(master, KEY_CONTEXT.passwordVerifier))
    .update(`owner-password:v2:${salt}:${password}`)
    .digest("base64url");
  return {
    v: 2,
    salt,
    digest,
    updatedAt: new Date().toISOString(),
  };
}

export function resetUserPassword() {
  const master = required("TRACKER_STATE_KEY");
  const password = normalizePassword(required("BALLERWATCH_RECOVERY_PASSWORD"));
  const current = loadUserState().settings;
  const nextVersion = Math.max(1, Number(current.webAuthVersion || 1)) + 1;
  const next = {
    ...current,
    webOwnerPassword: passwordRecord(master, password),
    webAuthVersion: nextVersion,
  };
  delete next.webPairCodeHash;
  delete next.webPairExpiresAt;
  delete next.webPairConsumedAt;
  saveUserState(next);
  return nextVersion;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const command = process.argv[2] || "";
  if (command !== "reset") {
    throw new Error("Usage: node shared/user-recovery.mjs reset");
  }
  const version = resetUserPassword();
  console.log(`Reset BallerWatch web user password and advanced auth revision to ${version}.`);
}

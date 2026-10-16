/** One-time, idempotent retirement of ordinary account records.
 * Protect the operator's maintenance password and app-wide match overrides.
 * Push subscriptions preserve the browser/provider subscription lifetime,
 * without retaining their former username. No account data enters public logs.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "./state-crypto.mjs";
import { cleanAccountlessSettings } from "./user-state.mjs";

export function scrubAccountRecords(record, now = new Date()) {
  const settings = cleanAccountlessSettings(record?.settings || {});
  return { settings };
}

export function scrubPushIdentity(state, now = new Date()) {
  if (!state?.vapid?.privateJwk || !Array.isArray(state.subscriptions)) return null;
  return {
    ...state,
    subscriptions: state.subscriptions
      .filter(item => item && typeof item.endpoint === "string")
      .map(item => ({
        endpoint: item.endpoint,
        expirationTime: item.expirationTime ?? null,
        keys: item.keys,
        channels: {
          pickup: item.channels?.pickup !== false,
          league: item.channels?.league !== false,
          version: item.channels?.version !== false,
        },
        teams: Array.isArray(item.teams) ? item.teams.slice(0,8) : [],
        rsvpTag: /^[a-f0-9]{64}$/.test(String(item.rsvpTag||"")) ? item.rsvpTag : "",
        createdAt: item.createdAt || now.toISOString(),
        updatedAt: item.updatedAt || now.toISOString(),
      })),
  };
}

export function migrateAccountlessFiles() {
  let changed=0;
  for (const [file, transform] of [
    ["state/user.json", scrubAccountRecords],
    ["state/web-push.json", scrubPushIdentity],
  ]) {
    if (!fs.existsSync(file)) continue;
    const encrypted=JSON.parse(fs.readFileSync(file,"utf8"));
    const value=decryptState(encrypted);
    if (!value || typeof value!=="object")
      throw new Error("Refusing to overwrite unreadable encrypted runtime state.");
    const updated=transform(value);
    if (!updated) throw new Error("Refusing to overwrite unrecognized encrypted runtime state.");
    if (JSON.stringify(updated)===JSON.stringify(value)) continue;
    fs.writeFileSync(file,JSON.stringify(encryptState(updated),null,2)+"\n");
    changed+=1;
  }
  return changed;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log("Encrypted accountless migration complete; updated state files:",
    migrateAccountlessFiles());
}

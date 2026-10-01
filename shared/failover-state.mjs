/**
 * Encrypted GitHub Actions-cache backup for last-known runtime files.
 *
 * Documentation baseline: v2.4.0. Cache payloads are encrypted before storage and never enter Git.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptState, encryptState } from "./state-crypto.mjs";
import { runtimePathsFor } from "./runtime-paths.mjs";

const BACKUP_DIR = ".runtime/failover";

export function backupPath(scope) {
  return path.join(BACKUP_DIR, `${scope}.json`);
}

export function saveFailoverState(scope) {
  const files = {};
  for (const file of runtimePathsFor(scope)) {
    if (fs.existsSync(file)) files[file] = fs.readFileSync(file, "utf8");
  }
  if (!Object.keys(files).length) {
    console.log(`No ${scope} runtime files available for failover backup.`);
    return 0;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(
    backupPath(scope),
    JSON.stringify(encryptState({ scope, savedAt: new Date().toISOString(), files }), null, 2) + "\n",
  );
  console.log(`Saved encrypted ${scope} failover backup with ${Object.keys(files).length} file(s).`);
  return Object.keys(files).length;
}

export function restoreFailoverState(scope) {
  const file = backupPath(scope);
  if (!fs.existsSync(file)) return 0;

  let payload;
  try {
    payload = decryptState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    payload = null;
  }
  if (!payload || payload.scope !== scope || typeof payload.files !== "object") {
    throw new Error(`Encrypted ${scope} failover backup could not be decrypted.`);
  }

  let count = 0;
  for (const runtimePath of runtimePathsFor(scope)) {
    const raw = payload.files[runtimePath];
    if (typeof raw !== "string") continue;
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(runtimePath, raw.endsWith("\n") ? raw : raw + "\n");
    count += 1;
  }
  console.log(`Restored ${count} ${scope} runtime file(s) from encrypted Actions cache backup.`);
  return count;
}

const isCli = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const command = process.argv[2];
  const scope = process.argv[3];
  if (command === "save") saveFailoverState(scope);
  else if (command === "restore") restoreFailoverState(scope);
  else throw new Error("Usage: node shared/failover-state.mjs save|restore <scope>");
}

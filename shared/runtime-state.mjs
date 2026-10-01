/**
 * Transfers scoped runtime files between GitHub Actions and the private Cloudflare runtime store.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { restoreFailoverState } from "./failover-state.mjs";
import { runtimePathsFor } from "./runtime-paths.mjs";

const DEFAULT_URL = "https://ballerwatch-telegram.vudhone.workers.dev";

function clean(value) {
  return String(value || "").trim();
}

function runtimeUrl() {
  return clean(process.env.BALLERWATCH_RUNTIME_URL || DEFAULT_URL).replace(/\/$/, "");
}

function adminSecret() {
  const token = clean(process.env.TELEGRAM_BOT_TOKEN);
  const chat = clean(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chat) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required for runtime-state access.");
  }
  return crypto
    .createHash("sha256")
    .update(`${token}|${chat}|ballerwatch-webhook-v1`)
    .digest("hex");
}

async function call(body) {
  const response = await fetch(`${runtimeUrl()}/admin/runtime-files`, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "content-type": "application/json",
      "x-ballerwatch-admin": adminSecret(),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(
      `Cloudflare runtime-state request failed (${response.status}): ${payload?.error || "unknown error"}`,
    );
  }
  return payload;
}

export async function pullRuntimeState(scope) {
  const files = runtimePathsFor(scope);
  try {
    const payload = await call({ action: "get", paths: files });
    let count = 0;
    for (const file of files) {
      const raw = payload.files?.[file];
      if (typeof raw !== "string" || !raw) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, raw.endsWith("\n") ? raw : raw + "\n");
      count += 1;
    }
    console.log(`Pulled ${count}/${files.length} ${scope} runtime-state file(s) from Cloudflare KV.`);
    return count;
  } catch (error) {
    const restored = restoreFailoverState(scope);
    if (!restored) throw error;
    console.warn(
      `Cloudflare runtime-state access failed; continuing with encrypted ${scope} Actions-cache backup.`,
    );
    return restored;
  }
}

export async function pushRuntimeState(scope) {
  const files = {};
  for (const file of runtimePathsFor(scope)) {
    if (!fs.existsSync(file)) continue;
    files[file] = fs.readFileSync(file, "utf8");
  }
  try {
    const payload = await call({ action: "put", files });
    console.log(`Pushed ${payload.count || 0} ${scope} runtime-state file(s) to Cloudflare KV.`);
    return Number(payload.count || 0);
  } catch (error) {
    if (String(process.env.BALLERWATCH_ALLOW_OFFLINE || "").toLowerCase() !== "true") throw error;
    console.warn("Cloudflare runtime-state write unavailable; encrypted failover backup remains authoritative until recovery.");
    return 0;
  }
}

export function cleanRuntimeState(scope) {
  let count = 0;
  for (const file of runtimePathsFor(scope)) {
    try {
      fs.rmSync(file, { force: true });
      count += 1;
    } catch {}
  }
  for (const dir of ["pickup/state", "league/state", "state", "requests"]) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {}
  }
  console.log(`Cleaned ${count} local ${scope} runtime-state path(s).`);
}

const command = process.argv[2];
const scope = process.argv[3];
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (command === "pull") await pullRuntimeState(scope);
  else if (command === "push") await pushRuntimeState(scope);
  else if (command === "clean") cleanRuntimeState(scope);
  else throw new Error("Usage: node shared/runtime-state.mjs pull|push|clean <listener|pickup|league|watchdog>");
}

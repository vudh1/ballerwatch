/**
 * Sends material RATS schedule changes to the Google Apps Script Calendar bridge.
 *
 * The bridge owns Calendar mutation. Applied encrypted state advances only after every
 * requested match succeeds, preserving fail-closed reconciliation semantics.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const SCHEDULE = "schedule.json";
const STATE = "calendar-snapshot.json";
const CHANGES = "calendar-changes.json";
const TELEGRAM_UPDATE = "telegram-update.json";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function bridgeVersion(url, { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: {"User-Agent": "ballerwatch/1.0"},
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Calendar bridge health HTTP ${response.status}`);
  const result = await response.json();
  return Number(result.version || 1);
}

export async function postBridge(payload, { fetchImpl = globalThis.fetch } = {}) {
  const url = requiredEnv("GOOGLE_CALENDAR_WEBHOOK_URL");
  const secret = requiredEnv("GOOGLE_CALENDAR_WEBHOOK_SECRET");

  if ((payload.updates || []).some((item) => item.oldKey)) {
    if (await bridgeVersion(url, {fetchImpl}) < 2) {
      throw new Error(
        "Calendar reschedule detected but deployed Apps Script bridge is v1; " +
        "redeploy league/google_apps_script/Code.gs before applying it",
      );
    }
  }

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "rats-league-watcher/1.0",
    },
    body: JSON.stringify({...payload, secret}),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Calendar bridge update HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) {
    throw new Error("Apps Script Calendar bridge rejected or failed the update");
  }
  return result;
}

export async function syncCalendar({
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  const feed = readJson(SCHEDULE);
  const state = fs.existsSync(STATE)
    ? readJson(STATE)
    : {version: 1, appliedMatches: {}};
  const changes = readJson(CHANGES);
  const pending = Array.isArray(changes.pending) ? changes.pending : [];
  if (!pending.length) {
    console.log("No Calendar changes.");
    return {updates: []};
  }

  const requests = pending.map((item) => {
    const oldKey = item.oldKey || item.key;
    const old = state.appliedMatches?.[oldKey];
    return {
      type: item.type,
      key: item.key,
      oldKey: oldKey !== item.key ? oldKey : null,
      match: item.match,
      previous: old?.match || null,
    };
  });

  const result = await postBridge({
    schemaVersion: 1,
    seasonId: feed.seasonId,
    sourceContentHash: feed.contentHash,
    updates: requests,
  }, {fetchImpl});

  const byKey = new Map((result.results || []).map((item) => [item.key, item]));
  const completed = [];
  state.appliedMatches ||= {};

  for (const item of pending) {
    const response = byKey.get(item.key);
    if (!response?.ok) {
      throw new Error(`Calendar bridge did not successfully apply ${item.key}`);
    }
    const match = item.match;
    if (item.oldKey && item.oldKey !== item.key) {
      delete state.appliedMatches[item.oldKey];
    }
    state.appliedMatches[item.key] = {
      fingerprint: match.calendarFingerprint,
      match,
    };
    const action = response.action || "updated";
    completed.push({action, match});
    console.log(`${action}: ${match.team} vs ${match.opponent} on ${match.date}`);
  }

  state.version = 1;
  state.lastAppliedContentHash = feed.contentHash;
  state.lastAppliedAt = now.toISOString();
  writeJson(STATE, state);
  writeJson(TELEGRAM_UPDATE, {updates: completed});
  return {updates: completed};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncCalendar();
}

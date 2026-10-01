/**
 * Decides whether Google Calendar needs mutation for the current RATS schedule.
 *
 * Applied Calendar state is decrypted only inside the workflow runner. This module
 * compares schedule-only fingerprints and writes a transient change plan.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { dateInZone, digest, normalizeText, TZ } from "./rats-utils.mjs";

const SCHEDULE = "schedule.json";
const STATE = "calendar-snapshot.json";
const BOOTSTRAP = "calendar-bootstrap.json";
const CHANGES = "calendar-changes.json";

export const CALENDAR_MATCH_FIELDS = [
  "team",
  "opponent",
  "homeAway",
  "date",
  "startTime",
  "endTime",
  "start",
  "end",
  "endEstimated",
  "timezone",
  "location",
  "fieldNotes",
  "jerseyColor",
  "opponentJerseyColor",
  "division",
  "season",
  "sourceUrl",
  "mapUrl",
  "eventType",
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function sameCalendarMatch(previous, current) {
  if (!previous || typeof previous !== "object" || !current || typeof current !== "object") {
    return false;
  }
  return CALENDAR_MATCH_FIELDS.every(
    (field) => (previous[field] ?? null) === (current[field] ?? null),
  );
}

export function pairHash(match) {
  return digest([
    normalizeText(match?.team),
    normalizeText(match?.opponent),
    normalizeText(match?.homeAway),
  ].join("|"));
}

export function futureMatches(feed, now = new Date()) {
  const today = dateInZone(now, TZ);
  const result = {};
  for (const team of feed?.teams || []) {
    for (const match of team?.matches || []) {
      if (match.end) {
        const end = new Date(match.end);
        if (!Number.isNaN(end.getTime()) && end <= now) continue;
      } else if (String(match.date || "") < today) {
        continue;
      }
      result[match.key] = {
        fingerprint: match.calendarFingerprint,
        match,
      };
    }
  }
  return result;
}

export function hydrateStateFromBootstrap(
  current,
  {
    stateFile = STATE,
    bootstrapFile = BOOTSTRAP,
  } = {},
) {
  if (fs.existsSync(stateFile)) return readJson(stateFile);

  const state = {version: 1, appliedMatches: {}};
  if (!fs.existsSync(bootstrapFile)) return state;

  const bootstrap = readJson(bootstrapFile);
  for (const entry of bootstrap.entries || []) {
    const key = entry.key;
    if (!key) continue;
    const currentItem = current[key];
    if (currentItem && currentItem.fingerprint === entry.fingerprint) {
      state.appliedMatches[key] = currentItem;
    } else {
      state.appliedMatches[key] = {
        fingerprint: entry.fingerprint,
        match: null,
        pairHash: entry.pairHash,
      };
    }
  }
  state.lastAppliedContentHash = bootstrap.lastAppliedContentHash;
  writeJson(stateFile, state);
  return state;
}

export function compare(feed, state, now = new Date()) {
  const current = futureMatches(feed, now);
  const applied = state?.appliedMatches || {};
  const pending = [];

  const unmatchedOld = Object.fromEntries(
    Object.entries(applied).filter(([key]) => !(key in current)),
  );

  for (const [key, item] of Object.entries(current)) {
    const old = applied[key];
    if (!old) {
      const hash = pairHash(item.match);
      const candidates = Object.entries(unmatchedOld)
        .filter(([, oldItem]) => oldItem?.pairHash === hash)
        .map(([oldKey]) => oldKey);
      if (candidates.length === 1) {
        pending.push({
          type: "rescheduled",
          oldKey: candidates[0],
          key,
          ...item,
        });
      } else {
        pending.push({type: "new", key, ...item});
      }
    } else if (old.fingerprint !== item.fingerprint) {
      if (sameCalendarMatch(old.match, item.match)) continue;
      pending.push({
        type: "changed",
        key,
        previousFingerprint: old.fingerprint,
        ...item,
      });
    }
  }

  const missing = [];
  for (const [key, value] of Object.entries(applied)) {
    if (key in current) continue;
    const oldMatch = value?.match;
    if (!oldMatch?.end) continue;
    const end = new Date(oldMatch.end);
    if (!Number.isNaN(end.getTime()) && end > now) {
      missing.push({key, ...value});
    }
  }

  return {current, pending, missing};
}

export function runCalendarGate({
  now = new Date(),
  scheduleFile = SCHEDULE,
  stateFile = STATE,
  bootstrapFile = BOOTSTRAP,
  changesFile = CHANGES,
} = {}) {
  const feed = readJson(scheduleFile);
  const current = futureMatches(feed, now);
  const state = hydrateStateFromBootstrap(current, {stateFile, bootstrapFile});
  const {pending, missing} = compare(feed, state, now);

  const result = {
    schemaVersion: 1,
    sourceContentHash: feed.contentHash,
    needsCalendar: pending.length > 0,
    pending,
    missingAppliedFutureMatches: missing,
  };
  writeJson(changesFile, result);
  console.log(`needsCalendar=${pending.length ? "true" : "false"}`);
  console.log(`pendingCount=${pending.length}`);
  if (missing.length) {
    console.log(
      `warning: ${missing.length} applied future match(es) disappeared; no deletion authorized`,
    );
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCalendarGate();
}

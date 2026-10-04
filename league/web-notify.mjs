/**
 * Records the single allowed RATS schedule-change web notification after Calendar sync.
 *
 * Production delivery is Web Push/notification-board only. This module has no
 * external messaging adapter and performs no network sends itself.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import {
  absoluteMinutesUntilStart,
  matchStartReminderDue,
} from "../shared/match-reminders.mjs";
import { appendWebNotification } from "../shared/web-notifications.mjs";
import { applyLeagueMatchOverride } from "../shared/match-overrides.mjs";
import { loadUserSettings } from "../shared/user-state.mjs";

const TZ = "America/Los_Angeles";
const UPDATE = "notification-update.json";
const SCHEDULE = "schedule.json";
const REMINDER_STATE = "state/notify.json";

export function formatTime(value) {
  if (!value) return "time not published";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("weekday")} ${pick("month")}/${pick("day")} ${pick("hour")}:${pick("minute")} ${pick("dayPeriod")}`;
}

export function jerseyIcon(color) {
  const value = String(color || "").trim().toLocaleLowerCase("en-US");
  if (value.includes("white")) return "⚪";
  if (value.includes("black")) return "⚫";
  if (value.includes("red")) return "🔴";
  if (value.includes("blue")) return "🔵";
  if (value.includes("yellow")) return "🟡";
  if (value.includes("green")) return "🟢";
  if (value.includes("orange")) return "🟠";
  if (value.includes("purple") || value.includes("violet")) return "🟣";
  if (value.includes("brown")) return "🟤";
  return "⚽";
}

export function buildWebText(updates, settings = {}) {
  const lines = [];
  for (const item of updates) {
    const match = applyLeagueMatchOverride(item.match || {}, settings);
    const verb = item.action === "created" ? "Added" : "Updated";
    const location = match.location || "location not published";
    const jersey = match.jerseyColor || "not published";
    const opponentJersey = match.opponentJerseyColor || "not published";
    lines.push(
      `${verb}: ${jerseyIcon(jersey)} ${match.team} vs ${match.opponent} — ` +
      `${formatTime(match.start)} — ${location} — jerseys ${jersey}/${opponentJersey}`,
    );
  }
  return lines.join("\n");
}

function loadReminderState() {
  try {
    const encrypted = JSON.parse(fs.readFileSync(REMINDER_STATE, "utf8"));
    const value = decryptState(encrypted);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveReminderState(value) {
  const current = loadReminderState();
  if (JSON.stringify(current) === JSON.stringify(value)) return false;
  fs.mkdirSync(path.dirname(REMINDER_STATE), { recursive: true });
  fs.writeFileSync(
    REMINDER_STATE,
    JSON.stringify(encryptState(value), null, 2) + "\n",
  );
  return true;
}

function scheduleMatches(settings = {}) {
  try {
    const schedule = JSON.parse(fs.readFileSync(SCHEDULE, "utf8"));
    return (Array.isArray(schedule?.teams) ? schedule.teams : [])
      .flatMap((team) => Array.isArray(team?.matches) ? team.matches : [])
      .filter((match) => match?.key && match?.start)
      .map((match) => applyLeagueMatchOverride(match, settings));
  } catch {
    return [];
  }
}

export function recordLeagueStartReminders({ now = new Date() } = {}) {
  const state = loadReminderState();
  const sent = new Set(Array.isArray(state.matchHourKeys) ? state.matchHourKeys : []);
  const settings = loadUserSettings();
  const matches = scheduleMatches(settings);
  const due = matches.filter((match) =>
    !sent.has(String(match.key)) &&
    matchStartReminderDue(absoluteMinutesUntilStart(match.start, now))
  );

  if (!due.length) {
    const futureKeys = new Set(
      matches
        .filter((match) => Number(absoluteMinutesUntilStart(match.start, now)) > 0)
        .map((match) => String(match.key)),
    );
    const nextKeys = [...sent].filter((key) => futureKeys.has(key));
    if (nextKeys.length !== sent.size) saveReminderState({ matchHourKeys: nextKeys });
    return false;
  }

  const lines = due.map((match) => {
    const jersey = match.jerseyColor || "not published";
    const location = match.location || "location not published";
    return (
      `${jerseyIcon(jersey)} ${match.team} vs ${match.opponent} — ` +
      `${formatTime(match.start)} — ${location} — ${jersey} jersey`
    );
  });

  appendWebNotification("league", {
    title: due.length === 1 ? "Match starts in 1 hour" : "Matches start in 1 hour",
    body: lines.join("\n"),
    tag: `rats-start-${String(due[0].key).slice(0, 80)}`,
  });

  for (const match of due) sent.add(String(match.key));
  const futureKeys = new Set(
    matches
      .filter((match) => Number(absoluteMinutesUntilStart(match.start, now)) > 0)
      .map((match) => String(match.key)),
  );
  saveReminderState({
    matchHourKeys: [...sent].filter((key) => futureKeys.has(key)).sort(),
  });
  console.log(`Recorded ${due.length} one-hour league match reminder(s).`);
  return true;
}

export function notifyWeb({ now = new Date() } = {}) {
  let recorded = false;
  const settings = loadUserSettings();
  if (fs.existsSync(UPDATE)) {
    const data = JSON.parse(fs.readFileSync(UPDATE, "utf8"));
    const updates = Array.isArray(data.updates) ? data.updates : [];
    if (updates.length) {
      appendWebNotification("league", {
        title: "RATS schedule updated",
        body: buildWebText(updates, settings),
        tag: `rats-${updates[0]?.match?.date || "schedule"}`,
      });
      console.log(`Web notification recorded for ${updates.length} schedule update(s).`);
      recorded = true;
    }
  }

  if (recordLeagueStartReminders({ now })) recorded = true;
  if (!recorded) console.log("No league web notification is due.");
  return recorded;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  notifyWeb();
}

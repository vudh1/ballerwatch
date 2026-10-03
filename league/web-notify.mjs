/**
 * Records the single allowed RATS schedule-change web notification after Calendar sync.
 *
 * Production delivery is Web Push/notification-board only. This module has no
 * external messaging adapter and performs no network sends itself.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { appendWebNotification } from "../shared/web-notifications.mjs";

const TZ = "America/Los_Angeles";
const UPDATE = "notification-update.json";

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

export function buildWebText(updates) {
  const lines = [];
  for (const item of updates) {
    const match = item.match;
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

export function notifyWeb() {
  if (!fs.existsSync(UPDATE)) {
    console.log("No successful Calendar changes to notify.");
    return false;
  }
  const data = JSON.parse(fs.readFileSync(UPDATE, "utf8"));
  const updates = Array.isArray(data.updates) ? data.updates : [];
  if (!updates.length) {
    console.log("No successful Calendar changes to notify.");
    return false;
  }

  appendWebNotification("league", {
    title: "RATS schedule updated",
    body: buildWebText(updates),
    tag: `rats-${updates[0]?.match?.date || "schedule"}`,
  });
  console.log(`Web notification recorded for ${updates.length} schedule update(s).`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  notifyWeb();
}

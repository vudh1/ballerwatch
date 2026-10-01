/**
 * Sends the single allowed RATS schedule-change Telegram notification after Calendar sync.
 *
 * Tests call the formatting helpers without network side effects. Production sends only
 * when the league workflow has already confirmed a material Calendar schedule change.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { appendWebNotification } from "../shared/web-notifications.mjs";

const TZ = "America/Los_Angeles";
const UPDATE = "telegram-update.json";

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

export function escapeHtml(value, quote = true) {
  let text = String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  if (quote) {
    text = text.replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
  }
  return text;
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

export function buildTelegramText(updates) {
  const lines = ["RATS schedule updated"];
  for (const item of updates) {
    const match = item.match;
    const verb = item.action === "created" ? "Added" : "Updated";
    const location = match.location || "location not published";
    const jersey = match.jerseyColor || "not published";
    const opponentJersey = match.opponentJerseyColor || "not published";
    const mapUrl = match.mapUrl || (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(String(location))
    );

    lines.push(
      `${verb}: ${jerseyIcon(jersey)} <b>${escapeHtml(match.team)}</b> vs ` +
      `${escapeHtml(match.opponent)} — ${formatTime(match.start)} — ` +
      `${escapeHtml(location)} — jerseys ${escapeHtml(jersey)}/${escapeHtml(opponentJersey)}`,
    );
    if (location !== "location not published") {
      lines.push(`🗺️ ${escapeHtml(mapUrl)}`);
    }
  }
  return lines.join("\n");
}

export async function notifyTelegram({ fetchImpl = globalThis.fetch } = {}) {
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

  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    console.warn("Telegram credentials are unavailable; web fallback notification was recorded.");
    return true;
  }

  try {
    const body = new URLSearchParams({
      chat_id: chatId,
      text: buildTelegramText(updates),
      disable_web_page_preview: "true",
      parse_mode: "HTML",
    });
    const response = await fetchImpl(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`Telegram send HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error("Telegram send failed");
    console.log(`Telegram + web notification recorded for ${updates.length} schedule update(s).`);
  } catch (error) {
    console.warn(
      `Telegram league delivery failed; web fallback remains available: ${error?.message || error}`,
    );
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await notifyTelegram();
}

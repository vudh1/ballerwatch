import { recordUnknownQuestion, refreshPublicRequests } from "../shared/feature-requests.mjs";
import { answerUnknownWithAi } from "../shared/ai-fallback.mjs";
import fs from "node:fs";
import { getTelegramUpdates, isOwnerChat, sendTelegram, sendTyping } from "../shared/telegram.mjs";
import { loadBotState, saveBotState } from "../shared/bot-state.mjs";
import { decryptState } from "../shared/state-crypto.mjs";
import { ensureEncryptedLeagueTeams, loadLeagueTeams, normalizeLeagueTeamName, saveLeagueTeams } from "../shared/league-teams.mjs";
import { loadEncryptedLeagueState } from "../shared/league-state.mjs";

const TIME_ZONE = "America/Los_Angeles";
const PICKUP_PRIVATE_STATE = "pickup/state/events.json";
const PICKUP_FEED_STATE = "pickup/state/feed.json";
const FEATURE_ANNOUNCEMENTS_PATH = "features/announcements.json";
const VERSION_HISTORY_PATH = "features/versions.json";

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeText(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

function localToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + days, 12));
  return [
    x.getUTCFullYear(),
    String(x.getUTCMonth() + 1).padStart(2, "0"),
    String(x.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekday(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12))).toLowerCase();
}

function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return `${wd} ${m}/${d}`;
}

function loadPickupFeed() {
  const encrypted = readJson(PICKUP_FEED_STATE);
  const payload = encrypted ? decryptState(encrypted) : null;
  return payload?.ok ? payload : null;
}

function availableDates() {
  const feed = loadPickupFeed();
  return Array.isArray(feed?.dates)
    ? feed.dates.map((x) => String(x.date || "")).filter(Boolean)
    : [];
}

function resolveDate(text, settings) {
  const dates = availableDates();
  const lower = text.toLowerCase();

  const iso = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const date = `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
    if (dates.includes(date)) return date;
  }

  const md = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (md) {
    const year = md[3] ? Number(md[3]) : Number(localToday().slice(0, 4));
    const date = `${year}-${String(Number(md[1])).padStart(2, "0")}-${String(Number(md[2])).padStart(2, "0")}`;
    if (dates.includes(date)) return date;
  }

  const months = {
    january:1, jan:1, february:2, feb:2, march:3, mar:3, april:4, apr:4,
    may:5, june:6, jun:6, july:7, jul:7, august:8, aug:8,
    september:9, sep:9, sept:9, october:10, oct:10,
    november:11, nov:11, december:12, dec:12,
  };
  for (const [name, month] of Object.entries(months)) {
    const re = new RegExp(`\\b${name}\\s+(\\d{1,2})\\b`, "i");
    const match = text.match(re);
    if (match) {
      const year = Number(localToday().slice(0, 4));
      const date = `${year}-${String(month).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
      if (dates.includes(date)) return date;
    }
  }

  if (/\btoday\b/i.test(text) && dates.includes(localToday())) {
    return localToday();
  }

  const tomorrow = addDays(localToday(), 1);
  if (/\btomorrow\b/i.test(text) && dates.includes(tomorrow)) {
    return tomorrow;
  }

  const weekdayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  for (const name of weekdayNames) {
    if (lower.includes(name)) {
      const match = dates.find((date) => date >= localToday() && weekday(date) === name);
      if (match) return match;
    }
  }

  if (/\bthat (?:day|date)\b/i.test(text) && settings.lastReferencedDate && dates.includes(settings.lastReferencedDate)) {
    return settings.lastReferencedDate;
  }

  const future = dates.filter((date) => date >= localToday()).sort();
  if (future.length === 1) return future[0];

  return null;
}

function eventForDate(date) {
  const feed = loadPickupFeed();
  const aggregate = feed?.events?.[date] || null;
  const encrypted = readJson(PICKUP_PRIVATE_STATE);
  const privateEvent = decryptState(encrypted)?.events?.[date] || {};
  return aggregate?.ok ? { ...aggregate, private: privateEvent } : null;
}

function spotsText(event) {
  const reserved = Number(event.reserved);
  const capacity = Number(event.capacity);
  if (!Number.isFinite(reserved)) return "Count unavailable.";
  if (!Number.isFinite(capacity)) return `${reserved} reserved.`;
  const remaining = capacity - reserved;
  if (remaining <= 0) return `${reserved}/${capacity} reserved — full.`;
  return `${reserved}/${capacity} reserved — ${remaining} ${remaining === 1 ? "spot" : "spots"} left.`;
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function ownerStatusLine(event, settings) {
  const myName = normalizeName(effectiveOwnerName(settings));
  if (!myName) return "";

  const players = Array.isArray(event.private?.players) ? event.private.players : [];
  const waitlist = Array.isArray(event.private?.waitlist) ? event.private.waitlist : [];

  if (players.some((person) => normalizeName(person?.name) === myName)) {
    return "✅ You are confirmed.";
  }

  const waitlistIndex = waitlist.findIndex(
    (person) => normalizeName(person?.name) === myName,
  );
  if (waitlistIndex >= 0) {
    return `🎟️ You are on the waitlist — position #${waitlistIndex + 1}.`;
  }

  return "You are not currently confirmed or on the waitlist.";
}

function googleMapsUrl(fieldName, address = "") {
  const query = [fieldName, address].filter(Boolean).join(", ").trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

function jerseyIcon(color) {
  const value = String(color || "").trim().toLowerCase();
  if (value.includes("white")) return "⚪";
  if (value.includes("black")) return "⚫";
  if (value.includes("red")) return "🔴";
  if (value.includes("blue")) return "🔵";
  if (value.includes("yellow")) return "🟡";
  if (value.includes("green")) return "🟢";
  if (value.includes("orange")) return "🟠";
  if (value.includes("purple") || value.includes("violet")) return "🟣";
  if (value.includes("brown")) return "🟤";
  return "👕";
}

function displayClock(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const isoMs = Date.parse(text);
  if (Number.isFinite(isoMs) && /T/.test(text)) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoMs));
  }

  const m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return text;
  const hour = Number(m[1]);
  const minute = m[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${minute} ${suffix}`;
}

function loadRatsToday() {
  const payload = loadEncryptedLeagueState("today.json");
  return payload?.ok ? payload : null;
}

function pickupTodayBlock(date) {
  const event = eventForDate(date);
  if (!event) return null;

  const fieldName = String(event.private?.fieldName || "").trim();
  const address = String(event.private?.address || "").trim();
  const start = displayClock(event.startTime);
  const end = displayClock(event.endTime);
  const lines = ["⚽ Pickup (TTF)"];

  if (start || end) {
    lines.push(`🕒 ${start || "?"}${end ? `–${end}` : ""}`);
  }

  if (fieldName) lines.push(`📍 ${fieldName}`);
  if (address) lines.push(address);

  const mapUrl = googleMapsUrl(fieldName, address);
  if (mapUrl) lines.push(`🗺️ ${mapUrl}`);

  return lines;
}

function ratsTodayBlocks(feed, date) {
  const blocks = [];
  if (feed?.date && String(feed.date) !== date) return blocks;

  for (const match of feed?.games || []) {
    const teamName = String(match.team || "RATS team");
    const opponent = String(match.opponent || "opponent");
    const lines = [`🏆 RATS — ${teamName} vs ${opponent}`];

    const start = displayClock(match.start || match.startTime);
    if (start) lines.push(`🕒 ${start}`);

    const location = String(match.location || "").trim();
    if (location) lines.push(`📍 ${location}`);

    const mapUrl = String(match.mapUrl || "").trim() || googleMapsUrl(location);
    if (mapUrl) lines.push(`🗺️ ${mapUrl}`);

    const jersey = String(match.jerseyColor || "").trim();
    const opponentJersey = String(match.opponentJerseyColor || "").trim();
    if (jersey) {
      lines.push(
        `${jerseyIcon(jersey)} Jersey: ${jersey}${opponentJersey ? ` (opponent: ${opponentJersey})` : ""}`,
      );
    }

    blocks.push(lines);
  }
  return blocks;
}

async function todayGamesReply() {
  const date = localToday();
  const blocks = [];

  const pickup = pickupTodayBlock(date);
  if (pickup) blocks.push(pickup);

  const rats = loadRatsToday();
  blocks.push(...ratsTodayBlocks(rats, date));

  if (!blocks.length) {
    if (!rats) {
      return `No pickup found today (${formatDate(date)}). RATS schedule is temporarily unavailable.`;
    }
    return `No pickup or RATS game is scheduled today (${formatDate(date)}).`;
  }

  const lines = [`Today's games — ${formatDate(date)}`];
  blocks.forEach((block, index) => {
    if (index > 0) lines.push("");
    lines.push(...block);
  });
  if (!rats) {
    lines.push("", "⚠️ RATS schedule is temporarily unavailable.");
  }
  return lines.join("\n");
}

function statusReply(date, event, settings) {
  const lines = [`${formatDate(date)}: ${spotsText(event)}`];
  const personal = ownerStatusLine(event, settings);
  if (personal) lines.push(personal);
  if (event.private?.locked === true) lines.push("Poll is locked.");
  if (event.private?.locked === false) lines.push("Poll is unlocked.");
  if (event.private?.fieldName) lines.push(`📍 ${event.private.fieldName}`);
  if (event.private?.address) lines.push(event.private.address);
  const mapUrl = googleMapsUrl(event.private?.fieldName, event.private?.address);
  if (mapUrl) lines.push(`🗺️ ${mapUrl}`);
  if (event.startTime || event.endTime) {
    lines.push(`🕒 ${event.startTime || "?"}–${event.endTime || "?"}`);
  }
  return lines.join("\n");
}

function hasExplicitDateReference(text) {
  const lower = text.toLowerCase();
  return (
    /\b20\d{2}-\d{1,2}-\d{1,2}\b/.test(lower) ||
    /\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/.test(lower) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(text) ||
    /\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|that day|that date)\b/i.test(text)
  );
}

function parseSnoozeDuration(text) {
  const match = text.match(
    /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|day|d)\b/i,
  );
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2].toLowerCase();
  let multiplier = 60 * 1000;
  if (/^(hours?|hrs?|hr|h)$/.test(unit)) multiplier = 60 * 60 * 1000;
  if (/^(days?|day|d)$/.test(unit)) multiplier = 24 * 60 * 60 * 1000;

  return Math.round(amount * multiplier);
}

function isSnoozeIntent(text) {
  return /\bsnooze\b/i.test(text) && !isSnoozeStatusIntent(text);
}

function isUnsnoozeIntent(text) {
  return /\b(unsnooze|cancel snooze|stop snoozing|resume notifications?|resume now|wake up)\b/i.test(text);
}

function isSnoozeStatusIntent(text) {
  return /\b(am i snooz(?:ed|ing)?|snooze status|am i muted by snooze|how long.*snooz|currently snooz)\b/i.test(text);
}

function cleanSnoozes(settings) {
  const now = Date.now();
  const snoozedDates = {};
  for (const [date, until] of Object.entries(settings.snoozedDates || {})) {
    const ms = Date.parse(until || "");
    if (Number.isFinite(ms) && ms > now) snoozedDates[date] = until;
  }

  const globalMs = Date.parse(settings.snoozeUntil || "");
  return {
    ...settings,
    snoozeUntil:
      Number.isFinite(globalMs) && globalMs > now ? settings.snoozeUntil : "",
    snoozedDates,
  };
}

function formatSnoozeUntil(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function remainingSnooze(iso) {
  const ms = Date.parse(iso || "") - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.ceil(hours / 24)} days`;
}

function snoozeStatusReply(settings, date = null) {
  const cleaned = cleanSnoozes(settings);
  const lines = [];

  if (date) {
    const until = cleaned.snoozedDates?.[date];
    if (until) {
      lines.push(
        `😴 ${formatDate(date)} is snoozed for about ${remainingSnooze(until)} (until ${formatSnoozeUntil(until)}).`,
      );
    } else if (cleaned.snoozeUntil) {
      lines.push(
        `😴 Global snooze is active for about ${remainingSnooze(cleaned.snoozeUntil)} (until ${formatSnoozeUntil(cleaned.snoozeUntil)}), so ${formatDate(date)} is also snoozed.`,
      );
    } else {
      lines.push(`🔔 ${formatDate(date)} is not snoozed.`);
    }
    return { settings: cleaned, reply: lines.join("\n") };
  }

  if (cleaned.snoozeUntil) {
    lines.push(
      `😴 Global snooze: about ${remainingSnooze(cleaned.snoozeUntil)} remaining (until ${formatSnoozeUntil(cleaned.snoozeUntil)}).`,
    );
  }

  for (const [d, until] of Object.entries(cleaned.snoozedDates || {}).sort()) {
    lines.push(
      `😴 ${formatDate(d)}: about ${remainingSnooze(until)} remaining (until ${formatSnoozeUntil(until)}).`,
    );
  }

  if (!lines.length) lines.push("🔔 You are not currently snoozing RSVP alerts.");
  return { settings: cleaned, reply: lines.join("\n") };
}

function isMuteIntent(text) {
  return /\b(can'?t go|cannot go|cant go|won'?t go|wont go|not going|don'?t need to watch|dont need to watch|do not need to watch|don'?t watch|dont watch|do not watch|stop watching|mute|skip)\b/i.test(text);
}

function isEnableIntent(text) {
  return /\b(re-?enable|reenable|resume|start watching|watch again|watch .* again|enable)\b/i.test(text);
}

function isCountIntent(text) {
  return /\b(count|how many|spots?|rsvp|availability|status|reserved|capacity)\b/i.test(text);
}

function isTodayGamesIntent(text) {
  const lower = text.toLowerCase();
  return (
    /\b(today'?s?\s+games?|games?\s+today)\b/.test(lower) ||
    /\bwhat\s+(?:game|games)\s+(?:is|are|do we have|we have)\s+today\b/.test(lower) ||
    /\bdo\s+we\s+have\s+(?:a\s+)?game\s+today\b/.test(lower) ||
    /\bany\s+(?:game|games)\s+today\b/.test(lower)
  );
}



function effectiveOwnerName(settings) {
  return normalizeText(settings?.ownerRsvpName || process.env.OWNER_RSVP_NAME || "");
}

function ownerNameReply(settings) {
  if (normalizeText(settings?.ownerRsvpName || "")) {
    return "Pickup RSVP/owner name: using encrypted Telegram override.";
  }
  if (normalizeText(process.env.OWNER_RSVP_NAME || "")) {
    return "Pickup RSVP/owner name: using default GitHub Secret.";
  }
  return "Pickup RSVP/owner name is not configured yet.";
}

function parseOwnerNameCommand(text) {
  const clean = normalizeText(text);

  if (
    /\b(?:what|which)\s+(?:is\s+)?(?:my\s+)?(?:owner|rsvp)\s+name\b/i.test(clean) ||
    /^\/?owner\s+name$/i.test(clean)
  ) {
    return { action: "show" };
  }

  let match = clean.match(
    /^(?:set|change|update)\s+(?:my\s+)?(?:owner|rsvp)\s+name\s+(?:to\s+)?(.+)$/i,
  );
  if (match) return { action: "set", name: normalizeText(match[1]) };

  match = clean.match(
    /^(?:my\s+)?(?:owner|rsvp)\s+name\s+(?:is\s+)?(.+)$/i,
  );
  if (match) return { action: "set", name: normalizeText(match[1]) };

  if (/^(?:remove|clear|unset)\s+(?:my\s+)?(?:owner|rsvp)\s+name$/i.test(clean)) {
    return { action: "clear" };
  }

  return null;
}

function effectivePickupEndpoint(settings) {
  return normalizeText(settings?.pickupEndpointOverride || process.env.UPSTREAM_ENDPOINT || "");
}

function parsePickupEndpointCommand(text) {
  const clean = normalizeText(text);
  if (/^\/?(?:rsvp|pickup)\s+endpoint$/i.test(clean) ||
      /\bwhat\s+(?:is\s+)?(?:the\s+)?(?:rsvp|pickup|upstream)\s+endpoint\b/i.test(clean)) {
    return { action: "show" };
  }
  const match = clean.match(
    /^(?:set|change|update)\s+(?:the\s+)?(?:rsvp|pickup|upstream)\s+endpoint\s+(?:to\s+)?(https:\/\/\S+)$/i,
  );
  if (match) return { action: "set", endpoint: match[1] };
  if (/^(?:clear|remove|unset)\s+(?:the\s+)?(?:rsvp|pickup|upstream)\s+endpoint(?:\s+override)?$/i.test(clean)) {
    return { action: "clear" };
  }
  return null;
}

function handlePickupEndpointCommand(command, settings) {
  if (command.action === "show") {
    if (normalizeText(settings?.pickupEndpointOverride || "")) {
      return { settings, reply: "RSVP endpoint: using encrypted Telegram override." };
    }
    if (normalizeText(process.env.UPSTREAM_ENDPOINT || "")) {
      return { settings, reply: "RSVP endpoint: using default GitHub Secret." };
    }
    return { settings, reply: "RSVP endpoint is not configured." };
  }
  if (command.action === "clear") {
    return {
      settings: { ...settings, pickupEndpointOverride: "", lastEndpointReminderAt: "" },
      reply: process.env.UPSTREAM_ENDPOINT
        ? "Cleared the encrypted RSVP endpoint override. Using the default GitHub Secret again."
        : "Cleared the RSVP endpoint override. No default UPSTREAM_ENDPOINT secret is configured.",
    };
  }
  try {
    const url = new URL(normalizeText(command.endpoint));
    if (url.protocol !== "https:") throw new Error();
    return {
      settings: {
        ...settings,
        pickupEndpointOverride: url.toString(),
        lastEndpointReminderAt: "",
      },
      reply: "Saved an encrypted RSVP endpoint override. The pickup watcher will test it on the next refresh.",
    };
  } catch {
    return { settings, reply: "Please provide a valid HTTPS RSVP endpoint." };
  }
}

function loadEndpointHealth() {
  const raw = readJson("pickup/state/source-health.json");
  const value = raw ? decryptState(raw) : null;
  return value && typeof value === "object" ? value : null;
}

async function promptForInvalidEndpoint(settings) {
  const health = loadEndpointHealth();
  if (!health || health.ok !== false) {
    if (settings.lastEndpointReminderAt) {
      return { ...settings, lastEndpointReminderAt: "" };
    }
    return settings;
  }
  const last = Date.parse(settings.lastEndpointReminderAt || "");
  const due = !Number.isFinite(last) || Date.now() - last >= 24 * 60 * 60 * 1000;
  if (!due) return settings;

  await sendTelegram([
    "⚠️ The current RSVP endpoint failed its latest pickup refresh.",
    `Source: ${health.source === "encrypted-override" ? "encrypted Telegram override" : "default GitHub Secret"}`,
    "If the endpoint changed, reply: set RSVP endpoint https://...",
    "I’ll remind you again tomorrow while the source remains unhealthy.",
  ].join("\n"));
  return { ...settings, lastEndpointReminderAt: new Date().toISOString() };
}

function missingSetup(settings) {
  const missing = [];
  if (!effectiveOwnerName(settings)) {
    missing.push("ownerRsvpName");
  }
  if (!effectivePickupEndpoint(settings)) {
    missing.push("pickupEndpoint");
  }
  if (!loadLeagueTeams().length) {
    missing.push("leagueTeams");
  }
  return missing;
}

function setupPrompt(field) {
  if (field === "ownerRsvpName") {
    return [
      "I need your exact pickup RSVP display name so I can identify your RSVP/waitlist status.",
      "Reply with: owner name <your exact RSVP name>",
      "It will be stored encrypted in the repo.",
    ].join("\n");
  }
  if (field === "pickupEndpoint") {
    return [
      "No RSVP endpoint default or override is configured.",
      "Preferred: add UPSTREAM_ENDPOINT as a GitHub Actions Secret.",
      "Or reply: set RSVP endpoint https://... (stored encrypted as an override).",
    ].join("\n");
  }
  if (field === "leagueTeams") {
    return [
      "I don't have any league teams configured yet.",
      "Reply with: add league team <team name>",
      "The team list will be stored encrypted.",
    ].join("\n");
  }
  return "";
}

function handleOwnerNameCommand(command, settings) {
  if (!command) return null;

  if (command.action === "show") {
    return { settings, reply: ownerNameReply(settings) };
  }

  if (command.action === "clear") {
    return {
      settings: {
        ...settings,
        ownerRsvpName: "",
        pendingSetupField: "ownerRsvpName",
        lastOwnerNameReminderAt: "",
      },
      reply: process.env.OWNER_RSVP_NAME
        ? "Cleared the encrypted owner-name override. Using the default GitHub Secret again."
        : ["Cleared your pickup RSVP/owner name.", setupPrompt("ownerRsvpName")].join("\n"),
    };
  }

  if (command.action === "set") {
    const name = normalizeText(command.name);
    if (!name) {
      return {
        settings,
        reply: "Tell me the exact RSVP display name, for example: owner name Alex Smith",
      };
    }
    return {
      settings: {
        ...settings,
        ownerRsvpName: name,
        lastOwnerNameReminderAt: "",
        pendingSetupField:
          settings?.pendingSetupField === "ownerRsvpName"
            ? ""
            : settings?.pendingSetupField || "",
      },
      reply: `Saved your pickup RSVP/owner name as: ${name}\nIt is stored encrypted.`,
    };
  }

  return null;
}

function ownerNameValidity(settings) {
  const configured = normalizeName(effectiveOwnerName(settings));
  if (!configured) return { status: "missing", participantCount: 0 };

  const encrypted = readJson(PICKUP_PRIVATE_STATE);
  const events = decryptState(encrypted)?.events || {};
  const names = [];
  for (const event of Object.values(events)) {
    for (const person of event?.players || []) {
      const name = normalizeName(person?.name);
      if (name) names.push(name);
    }
    for (const person of event?.waitlist || []) {
      const name = normalizeName(person?.name);
      if (name) names.push(name);
    }
  }

  if (!names.length) return { status: "unknown", participantCount: 0 };
  return {
    status: names.includes(configured) ? "valid" : "not-found",
    participantCount: names.length,
  };
}

async function promptForInvalidOwnerName(settings) {
  const validity = ownerNameValidity(settings);
  if (validity.status !== "not-found") {
    if (settings.lastOwnerNameReminderAt) {
      return { ...settings, lastOwnerNameReminderAt: "" };
    }
    return settings;
  }

  const lastReminder = Date.parse(settings.lastOwnerNameReminderAt || "");
  const due =
    !Number.isFinite(lastReminder) ||
    Date.now() - lastReminder >= 24 * 60 * 60 * 1000;
  if (!due) return settings;

  await sendTelegram(
    [
      "⚠️ Your configured pickup RSVP name was not found in the current RSVP participant/waitlist data.",
      "If your RSVP display name changed, reply: owner name <your exact RSVP name>",
      "I’ll remind you again tomorrow if it still does not match.",
    ].join("\n"),
  );
  return { ...settings, lastOwnerNameReminderAt: new Date().toISOString() };
}

async function promptForMissingSetup(settings) {
  const missing = missingSetup(settings);
  if (!missing.length) {
    if (settings.pendingSetupField || settings.lastSetupReminderAt) {
      return { ...settings, pendingSetupField: "", lastSetupReminderAt: "" };
    }
    return settings;
  }

  const current = missing.includes(settings.pendingSetupField)
    ? settings.pendingSetupField
    : missing[0];
  const lastReminder = Date.parse(settings.lastSetupReminderAt || "");
  const reminderDue =
    settings.pendingSetupField !== current ||
    !Number.isFinite(lastReminder) ||
    Date.now() - lastReminder >= 24 * 60 * 60 * 1000;

  if (reminderDue) {
    await sendTelegram(
      ["⚙️ BallerWatch setup is incomplete.", setupPrompt(current), "Send /setup to see all missing settings."].join("\n"),
    );
  }

  return {
    ...settings,
    pendingSetupField: current,
    lastSetupReminderAt: reminderDue
      ? new Date().toISOString()
      : settings.lastSetupReminderAt || "",
  };
}

function leagueTeamsReply() {
  const teams = loadLeagueTeams();
  if (!teams.length) return "No league teams are currently configured.";
  return [
    `Monitoring ${teams.length} league team${teams.length === 1 ? "" : "s"}:`,
    ...teams.map((name) => `• ${name}`),
  ].join("\n");
}

function findLeagueTeamIndex(teams, name) {
  const target = normalizeLeagueTeamName(name).toLocaleLowerCase("en-US");
  return teams.findIndex(
    (team) => normalizeLeagueTeamName(team).toLocaleLowerCase("en-US") === target,
  );
}

function parseLeagueTeamCommand(text) {
  const clean = normalizeText(text);

  if (
    /\b(?:what|which)\s+league\s+teams?.*\b(?:monitor|monitoring|watch|watching)\b/i.test(clean) ||
    /\bwhat\s+teams?.*\b(?:monitor|monitoring|watch|watching)\b/i.test(clean) ||
    /\b(?:show|list)\s+(?:the\s+)?(?:monitored\s+)?league\s+teams?\b/i.test(clean) ||
    /\bleague\s+teams?.*\b(?:monitor|monitoring|watch|watching)\b/i.test(clean) ||
    /^\/?league\s+teams?$/i.test(clean)
  ) {
    return { action: "list" };
  }

  let match = clean.match(/^(?:add|monitor|watch)\s+league\s+team\s+(.+)$/i);
  if (match) return { action: "add", name: normalizeLeagueTeamName(match[1]) };

  match = clean.match(/^(?:remove|delete|stop\s+monitoring|stop\s+watching)\s+league\s+team\s+(.+)$/i);
  if (match) return { action: "remove", name: normalizeLeagueTeamName(match[1]) };

  match = clean.match(/^(?:rename|change|modify)\s+league\s+team\s+(.+?)\s+(?:to|->)\s+(.+)$/i);
  if (match) {
    return {
      action: "rename",
      oldName: normalizeLeagueTeamName(match[1]),
      newName: normalizeLeagueTeamName(match[2]),
    };
  }

  return null;
}

function handleLeagueTeamCommand(command) {
  if (!command) return null;
  if (command.action === "list") {
    return leagueTeamsReply();
  }

  const teams = loadLeagueTeams();

  if (command.action === "add") {
    if (!command.name) return "Tell me the team name to add.";
    if (findLeagueTeamIndex(teams, command.name) >= 0) {
      return `Already monitoring league team: ${command.name}`;
    }
    const next = saveLeagueTeams([...teams, command.name]);
    return `Added league team: ${command.name}\nNow monitoring ${next.length} team${next.length === 1 ? "" : "s"}. Takes effect on the next league refresh (within about 5 minutes).`;
  }

  if (command.action === "remove") {
    if (!command.name) return "Tell me the team name to remove.";
    const index = findLeagueTeamIndex(teams, command.name);
    if (index < 0) return `I am not monitoring league team: ${command.name}`;
    if (teams.length === 1) {
      return "I won’t remove the last league team. Add another team first, then remove this one.";
    }
    const removed = teams[index];
    const next = teams.filter((_, i) => i !== index);
    saveLeagueTeams(next);
    return `Removed league team: ${removed}\nNow monitoring ${next.length} team${next.length === 1 ? "" : "s"}. Takes effect on the next league refresh (within about 5 minutes).`;
  }

  if (command.action === "rename") {
    if (!command.oldName || !command.newName) {
      return "Use: rename league team <old name> to <new name>";
    }
    const index = findLeagueTeamIndex(teams, command.oldName);
    if (index < 0) return `I am not monitoring league team: ${command.oldName}`;
    const duplicate = findLeagueTeamIndex(teams, command.newName);
    if (duplicate >= 0 && duplicate !== index) {
      return `Already monitoring league team: ${command.newName}`;
    }
    const oldName = teams[index];
    const next = [...teams];
    next[index] = command.newName;
    saveLeagueTeams(next);
    return `Renamed league team: ${oldName} → ${command.newName}\nTakes effect on the next league refresh (within about 5 minutes).`;
  }

  return null;
}


async function announceNewFeatures(settings) {
  const data = readJson(FEATURE_ANNOUNCEMENTS_PATH);
  const items = Array.isArray(data?.announcements) ? data.announcements : [];
  const enabledIds = items
    .filter((item) => item?.id && item.enabled !== false)
    .map((item) => String(item.id));

  let announcedIds;
  if (Array.isArray(settings.announcedFeatureAnnouncementIds)) {
    announcedIds = new Set(settings.announcedFeatureAnnouncementIds.map(String));
  } else {
    // Migration from the old single-last-ID scheme. Treat all announcements
    // that already existed at migration time as seen so historical releases
    // are never replayed or rotated.
    announcedIds = new Set(enabledIds);
  }

  const item = items.find(
    (candidate) =>
      candidate?.id &&
      candidate.enabled !== false &&
      !announcedIds.has(String(candidate.id)),
  );

  const migratedSettings = {
    ...settings,
    announcedFeatureAnnouncementIds: [...announcedIds],
  };
  delete migratedSettings.lastFeatureAnnouncementId;

  if (!item) return migratedSettings;

  const lines = [
    `🆕 BallerWatch ${item.version ? `v${item.version}` : "feature"} available`,
    String(item.message || item.title || "A new bot feature was added."),
  ];
  if (item.example) lines.push(`Try: ${item.example}`);

  await sendTelegram(lines.join("\n"));
  announcedIds.add(String(item.id));
  return {
    ...migratedSettings,
    announcedFeatureAnnouncementIds: [...announcedIds],
  };
}


function setupStatusReply(settings) {
  const teams = loadLeagueTeams();
  const ownerName = effectiveOwnerName(settings);
  const endpoint = effectivePickupEndpoint(settings);
  const missing = missingSetup(settings);
  const lines = [
    "BallerWatch setup:",
    `• Pickup RSVP/owner name: ${ownerName ? (settings.ownerRsvpName ? "encrypted override" : "default secret") : "missing"}`,
    `• RSVP endpoint: ${endpoint ? (settings.pickupEndpointOverride ? "encrypted override" : "default secret") : "missing"}`,
    `• League teams: ${teams.length ? `${teams.length} configured` : "missing"}`,
  ];

  const ownerValidity = ownerNameValidity(settings);
  if (ownerValidity.status === "not-found") {
    lines.push("⚠️ Configured owner name is not found in current RSVP participant/waitlist data.");
  } else if (ownerValidity.status === "valid") {
    lines.push("• Owner name match: verified in current RSVP data");
  }

  if (!missing.length) {
    lines.push("✅ All required user-provided setup is complete.");
  } else {
    lines.push("", "Still needed:");
    for (const field of missing) lines.push(setupPrompt(field));
  }
  return lines.join("\n");
}

function isSetupStatusIntent(text) {
  const clean = normalizeText(text);
  return (
    /^\/?setup$/i.test(clean) ||
    /\bsetup\s+status\b/i.test(clean) ||
    /\bwhat\s+(?:information|info|setup).*\b(?:missing|need|needed)\b/i.test(clean) ||
    /\bwhat\s+do\s+you\s+need\s+from\s+me\b/i.test(clean)
  );
}

function versionReply() {
  const data = readJson(VERSION_HISTORY_PATH);
  const current = String(data?.currentVersion || "unknown");
  const release = Array.isArray(data?.releases)
    ? data.releases.find((item) => String(item?.version) === current)
    : null;
  const lines = [`BallerWatch v${current}`];
  if (release?.title) lines.push(String(release.title));
  for (const change of (release?.changes || []).slice(0, 5)) {
    lines.push(`• ${change}`);
  }
  return lines.join("\n");
}

function buildAiContext(settings) {
  const pickupFeed = loadPickupFeed();
  const ratsToday = loadRatsToday();
  const teams = loadLeagueTeams();
  const payload = {
    localDate: localToday(),
    pickup: pickupFeed
      ? {
          dates: Array.isArray(pickupFeed.dates) ? pickupFeed.dates.slice(0, 8) : [],
          events: pickupFeed.events || {},
        }
      : null,
    ratsToday: ratsToday || null,
    leagueTeams: teams,
    settings: {
      mutedDates: settings.mutedDates || [],
      snoozeUntil: settings.snoozeUntil || "",
      snoozedDates: settings.snoozedDates || {},
      lastReferencedDate: settings.lastReferencedDate || "",
      ownerNameConfigured: Boolean(effectiveOwnerName(settings)),
      pickupEndpointConfigured: Boolean(effectivePickupEndpoint(settings)),
    },
  };
  return JSON.stringify(payload);
}

function isVersionIntent(text) {
  return /^\/?version(?:@[a-z0-9_]+)?$/i.test(normalizeText(text)) ||
    /\bwhat(?:'s| is) (?:the )?(?:bot |ballerwatch )?version\b/i.test(normalizeText(text));
}

async function handleMessage(text, settings) {
  const clean = normalizeText(text);
  if (!clean) return { settings, reply: "" };

  settings = cleanSnoozes(settings);

  if (isVersionIntent(clean)) {
    return { settings, reply: versionReply() };
  }

  if (isSetupStatusIntent(clean)) {
    return { settings, reply: setupStatusReply(settings) };
  }

  const pickupEndpointCommand = parsePickupEndpointCommand(clean);
  if (pickupEndpointCommand) {
    return handlePickupEndpointCommand(pickupEndpointCommand, settings);
  }

  const ownerNameCommand = parseOwnerNameCommand(clean);
  if (ownerNameCommand) {
    return handleOwnerNameCommand(ownerNameCommand, settings);
  }

  const leagueTeamCommand = parseLeagueTeamCommand(clean);
  if (leagueTeamCommand) {
    return { settings, reply: handleLeagueTeamCommand(leagueTeamCommand) };
  }

  const explicitDate = hasExplicitDateReference(clean);
  const date = resolveDate(clean, settings);

  if (isTodayGamesIntent(clean)) {
    return {
      settings,
      reply: await todayGamesReply(),
    };
  }

  if (isSnoozeStatusIntent(clean)) {
    return snoozeStatusReply(settings, explicitDate ? date : null);
  }

  if (isUnsnoozeIntent(clean)) {
    if (explicitDate) {
      if (!date) {
        return {
          settings,
          reply: "Tell me which valid match date to unsnooze, for example: unsnooze 10/8.",
        };
      }
      const snoozedDates = { ...(settings.snoozedDates || {}) };
      delete snoozedDates[date];
      return {
        settings: { ...settings, snoozedDates, lastReferencedDate: date },
        reply: `🔔 Snooze removed for ${formatDate(date)}.`,
      };
    }

    return {
      settings: { ...settings, snoozeUntil: "", snoozedDates: {} },
      reply: "🔔 All RSVP snoozes are off.",
    };
  }

  if (isSnoozeIntent(clean)) {
    const durationMs = parseSnoozeDuration(clean);
    if (!durationMs) {
      return {
        settings,
        reply: "Tell me how long to snooze, for example: snooze for 30 minutes, snooze 2 hours, or snooze 10/8 for 1 day.",
      };
    }

    const until = new Date(Date.now() + durationMs).toISOString();

    if (explicitDate) {
      if (!date) {
        return {
          settings,
          reply: "I couldn't match that to an available date. Try something like: snooze 10/8 for 2 hours.",
        };
      }
      return {
        settings: {
          ...settings,
          snoozedDates: { ...(settings.snoozedDates || {}), [date]: until },
          lastReferencedDate: date,
        },
        reply: `😴 Snoozed ${formatDate(date)} for about ${remainingSnooze(until)} (until ${formatSnoozeUntil(until)}).`,
      };
    }

    return {
      settings: { ...settings, snoozeUntil: until },
      reply: `😴 Snoozed all RSVP alerts for about ${remainingSnooze(until)} (until ${formatSnoozeUntil(until)}).`,
    };
  }

  if (isEnableIntent(clean)) {
    if (!date) {
      return { settings, reply: "Tell me which date to re-enable, for example: watch 10/8 again." };
    }
    const mutedDates = (settings.mutedDates || []).filter((d) => d !== date);
    return {
      settings: { ...settings, mutedDates, lastReferencedDate: date },
      reply: `Watching ${formatDate(date)} again.`,
    };
  }

  if (isMuteIntent(clean)) {
    if (!date) {
      return { settings, reply: "Tell me which date to stop watching, for example: I can’t go 10/8." };
    }
    const mutedDates = [...new Set([...(settings.mutedDates || []), date])].sort();
    return {
      settings: { ...settings, mutedDates, lastReferencedDate: date },
      reply: `Okay — I won’t send watcher alerts for ${formatDate(date)} until you re-enable it.`,
    };
  }

  if (isCountIntent(clean)) {
    if (!date) {
      return { settings, reply: "Tell me the date, for example: what’s the count for 10/8?" };
    }
    const event = eventForDate(date);
    if (!event) {
      return {
        settings: { ...settings, lastReferencedDate: date },
        reply: `I don’t currently have RSVP data for ${formatDate(date)}.`,
      };
    }
    return {
      settings: { ...settings, lastReferencedDate: date },
      reply: statusReply(date, event, settings),
    };
  }

  if (/^\/?help(?:@[a-z0-9_]+)?$/i.test(clean)) {
    return {
      settings,
      reply: [
        "You can ask:",
        "• what game is today?",
        "• what league teams are you monitoring?",
        "• /setup",
        "• /version",
        "• what information do you still need from me?",
        "• what is my owner name?",
        "• what is the RSVP endpoint?",
        "• set RSVP endpoint https://...",
        "• clear RSVP endpoint override",
        "• owner name <exact RSVP display name>",
        "• change owner name to <new name>",
        "• add league team <name>",
        "• rename league team <old> to <new>",
        "• remove league team <name>",
        "• what’s the count for 10/8?",
        "• don’t watch 10/8",
        "• watch 10/8 again",
        "• snooze for 30 minutes",
        "• snooze 10/8 for 2 hours",
        "• am I snoozing?",
        "• unsnooze",
        "• unsnooze 10/8",
      ].join("\n"),
    };
  }

  const ai = await answerUnknownWithAi(clean, buildAiContext(settings), settings);
  settings = ai.settings;

  if (ai.decision?.action === "answer") {
    return { settings, reply: ai.decision.reply };
  }

  const requestId = recordUnknownQuestion(clean);
  return {
    settings,
    reply: requestId
      ? `I couldn't answer that reliably yet. I saved your request privately as ${requestId} for the next feature cycle.`
      : "I couldn't answer that reliably yet.",
  };
}

async function main() {
  refreshPublicRequests();
  ensureEncryptedLeagueTeams();
  const state = loadBotState();
  let settings = state.settings || {};
  if (Object.prototype.hasOwnProperty.call(settings, "pickupEndpoint")) {
    const legacy = normalizeText(settings.pickupEndpoint || "");
    if (legacy && legacy !== normalizeText(process.env.UPSTREAM_ENDPOINT || "")) {
      settings.pickupEndpointOverride = legacy;
    }
    delete settings.pickupEndpoint;
  }
  settings.mutedDates = Array.isArray(settings.mutedDates) ? settings.mutedDates : [];
  settings.snoozedDates =
    settings.snoozedDates && typeof settings.snoozedDates === "object"
      ? settings.snoozedDates
      : {};
  settings.snoozeUntil = String(settings.snoozeUntil || "");
  settings = cleanSnoozes(settings);
  settings = await announceNewFeatures(settings);
  settings = await promptForMissingSetup(settings);
  settings = await promptForInvalidOwnerName(settings);
  settings = await promptForInvalidEndpoint(settings);

  const injectedUpdate = String(process.env.TELEGRAM_UPDATE_B64 || "").trim();
  let updates;
  if (injectedUpdate) {
    try {
      updates = [JSON.parse(Buffer.from(injectedUpdate, "base64").toString("utf8"))];
    } catch {
      throw new Error("TELEGRAM_UPDATE_B64 is invalid.");
    }
  } else {
    const pollSeconds = Math.max(0, Math.min(50, Number(process.env.TELEGRAM_POLL_TIMEOUT || 50)));
    updates = await getTelegramUpdates(state.lastUpdateId ? state.lastUpdateId + 1 : 0, pollSeconds);
  }
  let lastUpdateId = state.lastUpdateId || 0;

  for (const update of updates) {
    if (Number(update?.update_id) > lastUpdateId) {
      lastUpdateId = Number(update.update_id);
    }

    const message = update?.message;
    if (!message || !isOwnerChat(message.chat?.id)) continue;

    void sendTyping();
    const result = await handleMessage(message.text, settings);
    settings = result.settings;

    if (result.reply) {
      await sendTelegram(result.reply);
    }
  }

  const today = localToday();
  settings.mutedDates = settings.mutedDates.filter((date) => date >= today);
  settings = cleanSnoozes(settings);

  saveBotState(lastUpdateId, settings);
  console.log(`Processed ${updates.length} Telegram update(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

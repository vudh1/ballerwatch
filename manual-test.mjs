import fs from "node:fs";
import { decryptState } from "./shared/state-crypto.mjs";
import { loadBotSettings } from "./shared/bot-state.mjs";
import { sendTelegram } from "./shared/telegram.mjs";
import { selectPrimaryEvent } from "./pickup/selection.mjs";

const TZ = "America/Los_Angeles";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function localNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function formatDate(date) {
  const [y, m, d] = String(date).split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return `${weekday} ${m}/${d}`;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function ownerStatus(event, settings) {
  const owner = normalizeName(settings?.ownerRsvpName || process.env.OWNER_RSVP_NAME);
  if (!owner) return "Owner RSVP name: not configured";

  const players = Array.isArray(event?.private?.players) ? event.private.players : [];
  const waitlist = Array.isArray(event?.private?.waitlist) ? event.private.waitlist : [];

  if (players.some((p) => normalizeName(p?.name) === owner)) {
    return "✅ Owner RSVP: confirmed";
  }
  const index = waitlist.findIndex((p) => normalizeName(p?.name) === owner);
  if (index >= 0) return `🎟️ Owner RSVP: waitlist #${index + 1}`;
  return "Owner RSVP: neither confirmed nor waitlisted";
}

function pickupSummary() {
  const feedEncrypted = readJson("pickup/state/feed.json");
  const eventsEncrypted = readJson("pickup/state/events.json");
  const feed = feedEncrypted ? decryptState(feedEncrypted) : null;
  const privateState = eventsEncrypted ? decryptState(eventsEncrypted) : null;
  const settings = loadBotSettings();
  const now = localNow();

  if (!feed?.ok) {
    return ["⚽ Pickup: live refresh did not produce a readable encrypted feed"];
  }

  const dates = (feed.dates || []).map((item) => String(item.date || "")).filter(Boolean);
  const selected = selectPrimaryEvent({
    dates,
    loadEvent: (date) => {
      const aggregate = feed.events?.[date];
      return aggregate?.ok
        ? { ...aggregate, private: privateState?.events?.[date] || {} }
        : null;
    },
    nowDate: now.date,
    minuteOfDay: now.minuteOfDay,
    settings,
  });

  if (!selected.event) {
    return [
      "⚽ Pickup: live source refresh succeeded",
      "No eligible pickup event in the closest upcoming week.",
    ];
  }

  const event = selected.event;
  const lines = [
    "⚽ Pickup: live source refresh succeeded",
    `Primary: ${formatDate(event.date)} (${selected.reason})`,
    `RSVP: ${event.reserved ?? "?"}/${event.capacity ?? "?"}`,
    ownerStatus(event, settings),
    event.private?.locked ? "Poll: locked" : "Poll: unlocked",
  ];

  if (event.startTime || event.endTime) {
    lines.push(`Time: ${event.startTime || "?"}–${event.endTime || "?"}`);
  }
  if (event.private?.fieldName) lines.push(`Field: ${event.private.fieldName}`);
  return lines;
}

function leagueSummary() {
  const feed = readJson("league/schedule.json");
  if (!feed?.ok) {
    return ["🏆 League: skipped or live refresh did not produce a valid schedule"];
  }

  const now = new Date();
  const lines = [
    "🏆 League: live RATS refresh succeeded",
    `Season: ${feed.season || feed.seasonId || "unknown"}`,
    `Monitored teams: ${(feed.teams || []).length}`,
  ];

  for (const team of feed.teams || []) {
    const future = (team.matches || [])
      .filter((match) => {
        const end = Date.parse(match.end || match.start || "");
        return Number.isFinite(end) && end > now.getTime();
      })
      .sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));

    const next = future[0];
    if (!next) {
      lines.push(`• ${team.name}: no future published match`);
      continue;
    }
    lines.push(
      `• ${team.name}: ${formatDate(next.date)} vs ${next.opponent} at ${next.startTime || "time not published"}`,
    );
  }

  return lines;
}

async function main() {
  const lines = [
    "🧪 BallerWatch manual smoke test",
    "",
    ...pickupSummary(),
    "",
    ...leagueSummary(),
    "",
    "✅ No Calendar mutation or normal notification baseline was changed.",
  ];

  await sendTelegram(lines.join("\n"));
  console.log("Manual smoke test sent successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

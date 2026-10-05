/**
 * Performs notification-silent smoke verification of refreshed pickup and league runtime data.
 *
 * Documentation baseline: v2.3.0. Runtime/private data must never be committed to Git.
 */
import fs from "node:fs";
import { decryptState } from "../../shared/state-crypto.mjs";
import { loadUserSettings } from "../../shared/user-state.mjs";
import { selectPrimaryEvent } from "../../pickup/selection.mjs";

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

function verifyPickup() {
  const feedEncrypted = readJson("pickup/state/feed.json");
  const eventsEncrypted = readJson("pickup/state/events.json");
  if (!feedEncrypted || !eventsEncrypted) {
    throw new Error("Pickup live refresh did not produce encrypted state.");
  }

  const feed = decryptState(feedEncrypted);
  const privateState = decryptState(eventsEncrypted);
  if (!feed?.ok || !privateState) {
    throw new Error("Pickup encrypted state could not be verified.");
  }

  const settings = loadUserSettings();
  const now = localNow();
  const dates = (feed.dates || []).map((item) => String(item.date || "")).filter(Boolean);
  selectPrimaryEvent({
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
}

function verifyLeague() {
  const schedule = readJson("league/schedule.json");
  if (schedule == null) return;
  if (!schedule.ok || !Array.isArray(schedule.teams)) {
    throw new Error("League live refresh did not produce a valid runtime schedule.");
  }
}

function main() {
  verifyPickup();
  verifyLeague();
  console.log("Manual smoke test passed without sending notifications or changing Calendar.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/**
 * Pairs the Apps Script Calendar bridge to the intended private Google Calendar.
 *
 * The marker is temporary and non-sensitive. The bridge keeps the matched Calendar
 * ID in private Script Properties and this client logs only non-identifying status.
 */
import { pathToFileURL } from "node:url";

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function pairCalendar({ fetchImpl = globalThis.fetch } = {}) {
  const url = requiredEnv("GOOGLE_CALENDAR_WEBHOOK_URL");
  const secret = requiredEnv("GOOGLE_CALENDAR_WEBHOOK_SECRET");
  const marker = requiredEnv("BALLERWATCH_CALENDAR_PAIR_MARKER");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ballerwatch-calendar-pair/1.0",
    },
    body: JSON.stringify({
      action: "pair-calendar",
      marker,
      secret,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`Apps Script Calendar pairing HTTP ${response.status}`);
  }
  const result = await response.json();

  if (!result.ok || result.action !== "pair-calendar") {
    const detail = String(result.error || "unknown bridge error").trim();
    throw new Error(`Apps Script Calendar pairing failed: ${detail}`);
  }
  if (result.paired !== true) {
    throw new Error("Apps Script Calendar pairing did not confirm a target");
  }

  console.log("calendarPaired=true");
  console.log(`pairingMarkerDeleted=${Boolean(result.markerDeleted)}`);
  console.log(`previousManagedEventsDeleted=${Number(result.previousDeleted || 0)}`);
  console.log(`previousStaleMappingsCleared=${Number(result.previousStale || 0)}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await pairCalendar();
}

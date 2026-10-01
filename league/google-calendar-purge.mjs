/**
 * Deletes BallerWatch-managed RATS events through the authenticated Calendar bridge.
 *
 * Event IDs remain private in Apps Script properties. This client never logs secrets
 * or event IDs and reports only aggregate deletion/stale-mapping counts.
 */
import { pathToFileURL } from "node:url";

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function purgeCalendarEvents({ fetchImpl = globalThis.fetch } = {}) {
  const url = requiredEnv("GOOGLE_CALENDAR_WEBHOOK_URL");
  const secret = requiredEnv("GOOGLE_CALENDAR_WEBHOOK_SECRET");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ballerwatch-calendar-purge/1.0",
    },
    body: JSON.stringify({
      schemaVersion: 1,
      action: "purge",
      secret,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`Apps Script Calendar purge HTTP ${response.status}`);
  }
  const result = await response.json();

  if (!result.ok || result.action !== "purge") {
    const detail = String(result.error || "unknown bridge error").trim();
    throw new Error(`Apps Script Calendar purge failed: ${detail}`);
  }

  const deleted = Number(result.deleted || 0);
  const stale = Number(result.stale || 0);
  const cleared = Number(result.clearedProperties || 0);
  console.log(`calendarDeleted=${deleted}`);
  console.log(`calendarStaleMappingsCleared=${stale}`);
  console.log(`calendarTrackingPropertiesCleared=${cleared}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await purgeCalendarEvents();
}

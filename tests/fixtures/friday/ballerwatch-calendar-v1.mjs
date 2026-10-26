/**
 * Public-safe synthetic BallerWatch ICS source data for Vela/FRIDAY consumers.
 * No real people, fixtures, URLs, credentials, or runtime-state records.
 * Run syntheticCalendarIcs("initial" | "updated") to obtain real producer output.
 */
import { calendarToIcs } from "../../../backend/shared/ical-feed.mjs";

const beforeDst = {
  id: "league:synthetic:before-dst", kind: "league",
  title: "Sample FC vs Demo City", date: "2026-03-07",
  startTime: "8:00 PM", endTime: "10:00 PM", location: "Example Park",
};
const afterDst = {
  id: "league:synthetic:after-dst", kind: "league",
  title: "Demo City vs Sample FC", date: "2026-03-08",
  startTime: "8:00 PM", endTime: "10:00 PM", location: "Example Park",
};
const ongoingWatch = {
  id: "watch:synthetic:in-progress", kind: "watch", sport: "soccer",
  title: "Demo United vs Sample City", competition: "Example League",
  startUtc: "2026-11-01T17:00:00Z", endUtc: "2026-11-01T19:00:00Z",
  broadcasts: ["Example Sports"],
};
const cancelledWatch = {
  id: "watch:synthetic:cancelled", kind: "watch", sport: "soccer",
  title: "Example United vs Sample Wanderers", competition: "Example Cup",
  startUtc: "2026-11-03T18:00:00Z", endUtc: "2026-11-03T20:00:00Z",
  cancelled: true,
};

// Duplicated input matches a game followed by two watched teams. A removed
// input on a later complete snapshot is deliberately omitted, not tombstoned.
export const syntheticCalendarGames = Object.freeze({
  initial: [beforeDst, afterDst, ongoingWatch, ongoingWatch, cancelledWatch],
  updated: [afterDst, { ...ongoingWatch, broadcasts: [] }, cancelledWatch],
});

export function syntheticCalendarIcs(phase = "initial") {
  if (!Object.hasOwn(syntheticCalendarGames, phase)) {
    throw new RangeError("Unknown synthetic calendar phase");
  }
  return calendarToIcs(syntheticCalendarGames[phase], {
    name: "BallerWatch · Synthetic Vela fixture",
    updatedAt: "2026-10-25T12:00:00Z",
  });
}

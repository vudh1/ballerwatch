/**
 * Deterministic Saturday free-pickup schedule.
 *
 * These games are synthetic display/weather entries only. They have no RSVP source,
 * no source watcher, and no notification watcher. The schedule extends only through
 * the furthest effective RSVP-pickup or RATS league date already known to BallerWatch.
 */

export const FREE_PICKUP = Object.freeze({
  kind: "free_pickup",
  title: "Free Pickup",
  startTime: "10:30",
  endTime: "12:30",
  location: "Jefferson Park Playfield",
  mapsQuery: "Jefferson Park Playfield, Seattle, WA",
});

function validIsoDate(value) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function addIsoDays(date, days) {
  if (!validIsoDate(date)) return "";
  const [year, month, day] = String(date).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12));
  return value.toISOString().slice(0, 10);
}

export function isoWeekday(date) {
  if (!validIsoDate(date)) return -1;
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function furthestIsoDate(values = []) {
  return values
    .map((value) => String(value || ""))
    .filter(validIsoDate)
    .sort()
    .at(-1) || "";
}

export function saturdayFreePickupDates(startDate, horizonDate) {
  if (!validIsoDate(startDate) || !validIsoDate(horizonDate) || horizonDate < startDate) {
    return [];
  }
  const weekday = isoWeekday(startDate);
  const offset = (6 - weekday + 7) % 7;
  const result = [];
  for (
    let date = addIsoDays(startDate, offset);
    date && date <= horizonDate;
    date = addIsoDays(date, 7)
  ) {
    result.push(date);
  }
  return result;
}

export function freePickupBase(sourceDate) {
  if (!validIsoDate(sourceDate)) throw new Error("Free pickup source date is invalid.");
  return {
    id: `free:${sourceDate}`,
    kind: FREE_PICKUP.kind,
    sourceDate,
    date: sourceDate,
    title: FREE_PICKUP.title,
    startTime: FREE_PICKUP.startTime,
    endTime: FREE_PICKUP.endTime,
    location: FREE_PICKUP.location,
    address: "",
    mapsQuery: FREE_PICKUP.mapsQuery,
    reserved: null,
    capacity: null,
    rsvpUrl: "",
  };
}

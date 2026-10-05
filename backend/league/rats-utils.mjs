/**
 * Shared deterministic helpers for RATS league normalization and Calendar reconciliation.
 *
 * Canonical JSON intentionally matches the previous Python json.dumps(sort_keys=True,
 * separators=(",", ":")) behavior so existing v2 tracking keys/fingerprints stay stable.
 */
import crypto from "node:crypto";

export const TZ = "America/Los_Angeles";

export function canonicalJson(value) {
  function encode(item) {
    if (item === null) return "null";
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    if (typeof item === "object") {
      const entries = Object.keys(item)
        .filter((key) => item[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(item[key])}`);
      return `{${entries.join(",")}}`;
    }
    return JSON.stringify(item);
  }

  // Python's json.dumps defaults to ensure_ascii=True. Replacing UTF-16 code
  // units separately also matches Python's surrogate-pair escaping for emoji.
  return encode(value).replace(
    /[^\x00-\x7F]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function digest(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function normalizeText(value) {
  return String(value ?? "").trim().split(/\s+/).filter(Boolean).join(" ").toLocaleLowerCase("en-US");
}

function offsetMinutesAt(instant, timeZone = TZ) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value || "GMT";
  if (name === "GMT" || name === "UTC") return 0;
  const match = name.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Unable to determine ${timeZone} offset: ${name}`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const mins = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}

export function zonedIso(localDate, localTime, timeZone = TZ) {
  const utcLike = Date.parse(`${localDate}T${localTime}Z`);
  if (!Number.isFinite(utcLike)) throw new Error("Invalid local date/time");

  // Convert a local wall clock to its UTC instant by iterating the zone offset.
  let instantMs = utcLike;
  for (let i = 0; i < 3; i += 1) {
    const offset = offsetMinutesAt(new Date(instantMs), timeZone);
    const next = utcLike - offset * 60_000;
    if (next === instantMs) break;
    instantMs = next;
  }
  const offset = offsetMinutesAt(new Date(instantMs), timeZone);
  return `${localDate}T${localTime}${formatOffset(offset)}`;
}

function partsInZone(instant, timeZone = TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}

export function dateInZone(instant = new Date(), timeZone = TZ) {
  const parts = partsInZone(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function instantToZonedIso(instant, timeZone = TZ) {
  const parts = partsInZone(instant, timeZone);
  const offset = offsetMinutesAt(instant, timeZone);
  return (
    `${parts.year}-${parts.month}-${parts.day}T` +
    `${parts.hour}:${parts.minute}:${parts.second}${formatOffset(offset)}`
  );
}

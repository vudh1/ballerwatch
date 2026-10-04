/**
 * Normalizes and applies administrator match overrides without destroying source identity.
 *
 * Overrides are stored in encrypted user runtime state and keyed by the immutable
 * source-facing game ID (pickup:<source-date> or league:<schedule-key>).
 */

function clean(value, max = 300) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function normalizeMatchOverrideId(value) {
  const id = clean(value, 320);
  const match = id.match(/^(pickup|league):(.{1,300})$/);
  if (!match || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new Error("Invalid match override ID.");
  }
  return id;
}

export function normalizeIsoDate(value) {
  const date = clean(value, 20);
  const match = date.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Match date must use YYYY-MM-DD.");
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (
    probe.getUTCFullYear() !== Number(match[1]) ||
    probe.getUTCMonth() + 1 !== Number(match[2]) ||
    probe.getUTCDate() !== Number(match[3])
  ) {
    throw new Error("Match date is invalid.");
  }
  return date;
}

export function normalizeClock24(value) {
  const text = clean(value, 40);
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) throw new Error("Match time must use a valid clock time.");
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = String(match[3] || "").toUpperCase();
  if (minute > 59) throw new Error("Match time is invalid.");
  if (suffix) {
    if (hour < 1 || hour > 12) throw new Error("Match time is invalid.");
    hour = (hour % 12) + (suffix === "PM" ? 12 : 0);
  } else if (hour > 23) {
    throw new Error("Match time is invalid.");
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizedRecord(id, value, { requireDate = false, now = null } = {}) {
  const source = value && typeof value === "object" ? value : {};
  const normalizedId = normalizeMatchOverrideId(id || source.id);
  const kind = normalizedId.split(":", 1)[0];
  let date = "";
  try {
    if (source.date) date = normalizeIsoDate(source.date);
  } catch {
    if (requireDate) throw new Error("Match date is invalid.");
    return null;
  }
  if (requireDate && !date) throw new Error("Match date is required.");

  let startTime = "";
  let endTime = "";
  try {
    startTime = normalizeClock24(source.startTime);
    endTime = normalizeClock24(source.endTime);
  } catch (error) {
    if (requireDate) throw error;
    return null;
  }

  return {
    id: normalizedId,
    kind,
    date,
    startTime,
    endTime,
    location: clean(source.location, 240),
    updatedAt: clean(source.updatedAt, 80) || (now ? now.toISOString() : ""),
  };
}

export function normalizeMatchOverrideInput(value, { now = new Date() } = {}) {
  return normalizedRecord(value?.id, value, { requireDate: true, now });
}

export function cleanMatchOverrides(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [id, record] of Object.entries(source)) {
    try {
      const normalized = normalizedRecord(id, record);
      if (normalized) result[normalized.id] = normalized;
    } catch {}
  }
  return result;
}

export function matchOverride(settings, id) {
  const key = normalizeMatchOverrideId(id);
  return cleanMatchOverrides(settings?.matchOverrides)[key] || null;
}

export function pickupOverrideId(sourceDate) {
  return normalizeMatchOverrideId(`pickup:${String(sourceDate || "").trim()}`);
}

export function leagueOverrideId(game) {
  const explicit = clean(game?.key, 300);
  const fallback = [
    clean(game?.team, 80),
    clean(game?.opponent, 80),
    clean(game?.date, 20),
    clean(game?.startTime || game?.start, 80),
  ].join("|");
  const key = explicit || fallback;
  if (!key.replace(/\|/g, "")) throw new Error("League match key is unavailable.");
  return normalizeMatchOverrideId(`league:${key}`);
}

function sourceClock(value) {
  try {
    return normalizeClock24(value);
  } catch {
    const parsed = Date.parse(String(value || ""));
    if (!Number.isFinite(parsed)) return "";
    const date = new Date(parsed);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
}

function shiftedIso(source, date, time) {
  if (!date || !time) return source || null;
  const offset = String(source || "").match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] || "-08:00";
  return `${date}T${time}:00${offset}`;
}

export function applyPickupMatchOverride(source, settings = {}) {
  const sourceDate = String(source?.sourceDate || source?.date || "").trim();
  const id = source?.id || pickupOverrideId(sourceDate);
  const override = matchOverride(settings, id);
  if (!override) {
    return {
      ...source,
      id,
      sourceDate,
      manualOverride: false,
      overrideUpdatedAt: "",
    };
  }
  return {
    ...source,
    id,
    sourceDate,
    date: override.date || source.date,
    startTime: override.startTime || source.startTime || "",
    endTime: override.endTime || source.endTime || "",
    fieldName: override.location || source.fieldName || "",
    address: override.location ? "" : (source.address || ""),
    manualOverride: true,
    overrideUpdatedAt: override.updatedAt,
  };
}

export function applyLeagueMatchOverride(game, settings = {}) {
  const id = leagueOverrideId(game);
  const override = matchOverride(settings, id);
  if (!override) {
    return {
      ...game,
      overrideId: id,
      manualOverride: false,
      overrideUpdatedAt: "",
    };
  }

  const date = override.date || String(game?.date || "");
  const startTime = override.startTime || sourceClock(game?.startTime || game?.start);
  const endTime = override.endTime || sourceClock(game?.endTime || game?.end);
  const location = override.location || String(game?.location || "");

  return {
    ...game,
    date,
    startTime,
    endTime,
    start: shiftedIso(game?.start, date, startTime),
    end: shiftedIso(game?.end, date, endTime),
    location,
    mapUrl: location
      ? "https://maps.google.com/?q=" + encodeURIComponent(location)
      : null,
    overrideId: id,
    manualOverride: true,
    overrideUpdatedAt: override.updatedAt,
  };
}

/** Per-browser match-card corrections. Never upload these records.
 * They alter only the displayed calendar and cards on this device; public
 * fixture caches stay canonical and scheduled push still follows RATS/RSVP.
 */
// Beta testers can correct/hide fixtures without changing the production
// view on the same phone. Both remain private and persistent per device.
export const LOCAL_MATCH_EDITS_KEY = typeof window !== "undefined" &&
  /^\/ballerwatch\/beta(?:\/|$)/.test(window.location?.pathname || "")
  ? "ballerwatch:beta:local-match-edits:v1"
  : "ballerwatch:local-match-edits:v1";
const MAX_ITEMS = 100;
const MAX_BYTES = 48_000;
const validId = (id) => /^(pickup|league|free):[^\u0000-\u001f\u007f]{1,300}$/.test(String(id || ""));
const clean = (value, max) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
const validDate = (date) => {
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) return false;
  const d = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], 12));
  return d.getUTCFullYear() === +match[1] && d.getUTCMonth() + 1 === +match[2] &&
    d.getUTCDate() === +match[3];
};
const validTime = (time) => time === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

function normalizedOverride(id, input) {
  if (!validId(id) || !input || !validDate(input.date)) return null;
  const startTime = clean(input.startTime, 5), endTime = clean(input.endTime, 5);
  if (!validTime(startTime) || !validTime(endTime)) return null;
  return {
    id, date: input.date, startTime, endTime,
    location: clean(input.location, 240),
    updatedAt: clean(input.updatedAt, 48),
  };
}

export function normalizeLocalMatchEdits(value) {
  const source = value && typeof value === "object" ? value : {};
  const overrides = {}, hidden = {};
  for (const [id, entry] of Object.entries(source.overrides || {}).slice(0, MAX_ITEMS)) {
    const normal = normalizedOverride(id, entry);
    if (normal) overrides[id] = normal;
  }
  for (const [id, entry] of Object.entries(source.hidden || {}).slice(0, MAX_ITEMS)) {
    if (!validId(id)) continue;
    hidden[id] = {
      id, label: clean(entry?.label, 180), date: validDate(entry?.date) ? entry.date : "",
      hiddenAt: clean(entry?.hiddenAt, 48),
    };
  }
  return { schema: 1, overrides, hidden };
}

export function readLocalMatchEdits(storage) {
  try {
    const raw = storage.getItem(LOCAL_MATCH_EDITS_KEY);
    if (!raw) return normalizeLocalMatchEdits(null);
    if (raw.length > MAX_BYTES) {
      storage.removeItem(LOCAL_MATCH_EDITS_KEY);
      return normalizeLocalMatchEdits(null);
    }
    return normalizeLocalMatchEdits(JSON.parse(raw));
  } catch { return normalizeLocalMatchEdits(null); }
}

export function writeLocalMatchEdits(storage, state) {
  try {
    const value = JSON.stringify(normalizeLocalMatchEdits(state));
    if (value.length > MAX_BYTES) return false;
    storage.setItem(LOCAL_MATCH_EDITS_KEY, value);
    return true;
  } catch { return false; }
}

export function setLocalMatchOverride(storage, input, now = new Date()) {
  const normal = normalizedOverride(input?.id, { ...input, updatedAt: now.toISOString() });
  if (!normal) return false;
  const state = readLocalMatchEdits(storage);
  state.overrides[normal.id] = normal;
  return writeLocalMatchEdits(storage, state);
}

export function clearLocalMatchOverride(storage, id) {
  if (!validId(id)) return false;
  const state = readLocalMatchEdits(storage);
  delete state.overrides[id];
  return writeLocalMatchEdits(storage, state);
}

export function setLocalMatchHidden(storage, game, hidden = true, now = new Date()) {
  if (!validId(game?.id)) return false;
  const state = readLocalMatchEdits(storage);
  if (hidden) {
    state.hidden[game.id] = {
      id: game.id, label: clean(game.title || game.dateLabel || "", 180),
      date: validDate(game.date) ? game.date : "",
      hiddenAt: now.toISOString(),
    };
  } else delete state.hidden[game.id];
  return writeLocalMatchEdits(storage, state);
}

export function applyLocalMatchEdits(calendar, state, dateLabel) {
  if (!calendar || !Array.isArray(calendar.games)) return calendar;
  const changes = normalizeLocalMatchEdits(state);
  const games = calendar.games.flatMap((source, index) => {
    if (changes.hidden[source.id]) return [];
    const override = changes.overrides[source.id];
    if (!override) return [{ ...source, _localOrder: index }];
    const newLocation = override.location;
    const moved = override.date !== source.date;
    const relabeled = typeof dateLabel === "function"
      ? dateLabel(override.date) : override.date;
    const modified = {
      ...source, date: override.date, dateLabel: relabeled,
      startTime: override.startTime, endTime: override.endTime,
      time: [override.startTime, override.endTime].filter(Boolean).join("–"),
      location: newLocation || source.location || "",
      address: newLocation ? "" : source.address || "",
      mapsQuery: newLocation || source.mapsQuery || "",
      overrideActive: true, overrideUpdatedAt: override.updatedAt,
      deviceOverride: true, _localOrder: index,
    };
    if (newLocation && newLocation !== source.location) {
      modified.coordinates = null;
      modified.venueCoordinates = null;
      modified.locationUrl = "";
      modified.mapUrl = "";
    }
    if (moved) {
      modified.weather = null;
      modified.weatherStale = false;
    }
    delete modified.shareText;
    return [modified];
  }).sort((a, b) => a.date.localeCompare(b.date) ||
    String(a.startTime || "").localeCompare(String(b.startTime || "")) ||
    a._localOrder - b._localOrder)
    .map(({ _localOrder, ...game }) => game);
  return { ...calendar, games };
}

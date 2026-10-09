/**
 * Append-only public RATS venue directory and conservative field-name resolution.
 *
 * Deliberately never guesses between numbered fields or directional sub-fields.
 * A fuzzy match needs a strong unique name match; otherwise callers use Maps search.
 */
export const VENUE_DIRECTORY_SCHEMA = 1;
const IGNORE = new Set(["soccer", "football", "field", "fields", "playfield", "playfields",
  "pitch", "pitches", "sports", "sport", "athletic", "complex", "seattle", "wa", "usa"]);
const IMPORTANT = new Set(["north", "south", "east", "west", "upper", "lower",
  "indoor", "outdoor", "turf", "grass"]);

export function validRatsVenueUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 1200) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return "";
    const h = u.hostname.toLowerCase();
    const google = (h === "google.com" || h.endsWith(".google.com")) &&
      (u.pathname.startsWith("/maps") || h.startsWith("maps."));
    const shortMaps = h === "maps.app.goo.gl" || (h === "goo.gl" && u.pathname.startsWith("/maps"));
    const ratsVenue = (h === "seattlerats.org" || h === "www.seattlerats.org") &&
      /^\/venue\/[^/]+\/?$/.test(u.pathname);
    return google || shortMaps || ratsVenue ? u.href : "";
  } catch { return ""; }
}

export function validVenueCoordinates(point) {
  if (!point || typeof point !== "object") return null;
  if (point.latitude == null || point.longitude == null ||
    point.latitude === "" || point.longitude === "") return null;
  const latitude = Number(point.latitude), longitude = Number(point.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0) ? { latitude, longitude } : null;
}

export function venueNameParts(value) {
  const raw = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/\bno\.?\s*(\d+)\b/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const words = raw.split(/\s+/).filter(Boolean);
  const qualifiers = words.filter(w => IMPORTANT.has(w) || /^\d+$/.test(w)).sort();
  const core = words.filter(w => !IGNORE.has(w) && !IMPORTANT.has(w) && !/^\d+$/.test(w))
    .join(" ");
  return { key: [...words].join(" "), core, qualifiers: qualifiers.join("|") };
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 4) return 999;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}

function nameScore(requested, candidate) {
  if (!requested.key || !candidate.key) return 0;
  if (requested.key === candidate.key) return 1;
  if (!requested.core || !candidate.core || requested.qualifiers !== candidate.qualifiers) return 0;
  if (requested.core === candidate.core) return 0.99;
  if (requested.core.length < 6 || candidate.core.length < 6) return 0;
  const max = Math.max(requested.core.length, candidate.core.length);
  const ratio = 1 - distance(requested.core, candidate.core) / max;
  return ratio >= 0.84 ? ratio : 0;
}

function cleanEntry(entry) {
  const name = String(entry?.name || "").trim().replace(/\s+/g, " ").slice(0, 150);
  if (!venueNameParts(name).core) return null;
  return {
    name,
    aliases: [...new Set((Array.isArray(entry?.aliases) ? entry.aliases : [])
      .map(a => String(a || "").trim().slice(0, 150)).filter(Boolean))].slice(0, 12),
    url: validRatsVenueUrl(entry?.url),
    coordinates: validVenueCoordinates(entry?.coordinates),
  };
}

export function appendVenueObservations(previous = {}, observations = []) {
  const venues = (Array.isArray(previous?.venues) ? previous.venues : [])
    .map(cleanEntry).filter(Boolean).slice(0, 2000);
  let added = 0, enriched = 0;
  for (const item of observations) {
    const incoming = cleanEntry(item);
    if (!incoming) continue;
    const norm = venueNameParts(incoming.name);
    const exact = venues.find(v => [v.name, ...v.aliases]
      .some(alias => venueNameParts(alias).key === norm.key));
    // Punctuation, "soccer/playfield" suffixes, and reordered qualifiers
    // may differ while naming the identical fixture venue.
    const equivalent = !exact && venues.find(v => {
      const known = venueNameParts(v.name);
      const sameBase = norm.core.length >= 7 && known.core === norm.core &&
        known.qualifiers === norm.qualifiers;
      const noConflictingUrl = !incoming.url || !v.url || incoming.url === v.url;
      const noConflictingGps = !incoming.coordinates || !v.coordinates ||
        (incoming.coordinates.latitude === v.coordinates.latitude &&
          incoming.coordinates.longitude === v.coordinates.longitude);
      return sameBase && noConflictingUrl && noConflictingGps;
    });
    if (exact || equivalent) {
      const existing = exact || equivalent;
      if (equivalent && existing.aliases.length < 12) existing.aliases.push(incoming.name);
      // A discovered verified destination is immutable. Empty entries can be
      // filled later when RATS starts publishing a real link/GPS.
      if (!existing.url && incoming.url) { existing.url = incoming.url; enriched++; }
      if (!existing.coordinates && incoming.coordinates) { existing.coordinates = incoming.coordinates; enriched++; }
      continue;
    }
    if (venues.length >= 2000) break;
    venues.push(incoming);
    added++;
  }
  return { directory: { schemaVersion: VENUE_DIRECTORY_SCHEMA, venues }, added, enriched };
}

export function matchVenue(directory, requestedName) {
  const request = venueNameParts(requestedName);
  if (!request.core) return null;
  let matches = [];
  for (const venue of (Array.isArray(directory?.venues) ? directory.venues : [])) {
    const entry = cleanEntry(venue);
    if (!entry) continue;
    const score = Math.max(...[entry.name, ...entry.aliases]
      .map(name => nameScore(request, venueNameParts(name))));
    if (score >= 0.84) matches.push({ entry, score });
  }
  matches.sort((a, b) => b.score - a.score);
  if (!matches.length) return null;
  // Fail closed for competing nearly-identical names, including typos that
  // could identify two adjacent sports fields.
  if (matches[1] && matches[0].score - matches[1].score < 0.08) return null;
  return { ...matches[0].entry, matchType: matches[0].score >= 0.99 ? "exact" : "fuzzy" };
}

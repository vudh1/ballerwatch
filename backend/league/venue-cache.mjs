/**
 * Persistent RATS venue observations, encrypted with the runtime-state key.
 * Only new venue names or previously missing verified map destinations are saved.
 * No network requests, Google scraping, or repeated geocoding are needed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decryptState, encryptState } from "../shared/state-crypto.mjs";
import { appendVenueObservations } from "../shared/venue-directory.mjs";
import { publishedVenueCoordinates, publishedVenueUrl } from "./watcher.mjs";
import { discoverPublishedRatsVenue } from "./venue-site.mjs";

export const VENUES_FILE = fileURLToPath(new URL("../../league/state/venues.json", import.meta.url));
function fromEvent(event) {
  if (!event || typeof event !== "object") return null;
  const venue = event.venue && typeof event.venue === "object" ? event.venue : {};
  const field = event.field && typeof event.field === "object" ? event.field : {};
  return {
    name: typeof event.location === "string" ? event.location : venue.name || field.name || "",
    url: publishedVenueUrl(event),
    coordinates: publishedVenueCoordinates(event),
  };
}

export function readVenues(file = VENUES_FILE) {
  if (!fs.existsSync(file)) return { schemaVersion: 1, venues: [] };
  const value = decryptState(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!value || !Array.isArray(value.venues)) throw new Error("Invalid encrypted RATS venue directory");
  return value;
}

export function captureVenueObservations(observations, file = VENUES_FILE) {
  const previous = readVenues(file);
  const result = appendVenueObservations(previous, observations);
  if (result.added || result.enriched || result.checked) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(encryptState(result.directory), null, 2) + "\n");
  }
  return { ...result, count: result.directory.venues.length };
}

export function captureVenueEvents(events = [], file = VENUES_FILE) {
  return captureVenueObservations(events.map(fromEvent).filter(Boolean), file);
}

export async function captureLiveLeagueVenues(
  file = VENUES_FILE,
  scheduleFile = "league/schedule.json",
  { fetchImpl = globalThis.fetch, now = new Date(), maxLookups = 4 } = {},
) {
  const schedule = JSON.parse(fs.readFileSync(scheduleFile, "utf8"));
  if (!schedule?.ok || !Array.isArray(schedule.teams)) throw new Error("Invalid league schedule");
  const initial = captureVenueObservations(
    schedule.teams.flatMap(team => team.matches || []).map(match => ({
      name: match.location, url: match.locationUrl, coordinates: match.venueCoordinates,
    })), file,
  );

  // Only unresolved source fields are checked, once per day at most. A stable
  // published map destination never triggers another website lookup.
  const due = readVenues(file).venues.filter(venue => {
    if (venue.mapUrl || (venue.url && !/^https:\/\/(?:www\.)?seattlerats\.org\//.test(venue.url))) {
      return false;
    }
    return !venue.discoveryCheckedAt ||
      now.getTime() - Date.parse(venue.discoveryCheckedAt) >= 24 * 60 * 60 * 1000;
  }).slice(0, Math.max(0, Math.min(4, maxLookups)));

  const observations = [];
  for (const venue of due) {
    const published = await discoverPublishedRatsVenue(venue.name, venue.url, {fetchImpl});
    const observation = {name: venue.name, discoveryCheckedAt: now.toISOString()};
    if (published?.mapUrl) observation.mapUrl = published.mapUrl;
    if (!venue.url && published?.sourceUrl) observation.url = published.sourceUrl;
    observations.push(observation);
  }
  if (!observations.length) return initial;
  const discovery = captureVenueObservations(observations, file);
  return {
    ...discovery,
    added: initial.added + discovery.added,
    enriched: initial.enriched + discovery.enriched,
  };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const command = process.argv[2];
  if (command !== "capture-live") throw new Error("Usage: node venue-cache.mjs capture-live");
  const result = await captureLiveLeagueVenues();
  console.log("RATS venue cache: " + result.count + " names, " +
    result.added + " added, " + result.enriched + " enriched.");
}

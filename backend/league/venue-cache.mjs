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
  if (result.added || result.enriched) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(encryptState(result.directory), null, 2) + "\n");
  }
  return { ...result, count: result.directory.venues.length };
}

export function captureVenueEvents(events = [], file = VENUES_FILE) {
  return captureVenueObservations(events.map(fromEvent).filter(Boolean), file);
}

export function captureLiveLeagueVenues(file = VENUES_FILE, scheduleFile = "league/schedule.json") {
  const schedule = JSON.parse(fs.readFileSync(scheduleFile, "utf8"));
  if (!schedule?.ok || !Array.isArray(schedule.teams)) throw new Error("Invalid league schedule");
  return captureVenueObservations(
    schedule.teams.flatMap(team => team.matches || []).map(match => ({
      name: match.location, url: match.locationUrl, coordinates: match.venueCoordinates,
    })), file,
  );
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const command = process.argv[2];
  if (command !== "capture-live") throw new Error("Usage: node venue-cache.mjs capture-live");
  const result = captureLiveLeagueVenues();
  console.log("RATS venue cache: " + result.count + " names, " +
    result.added + " added, " + result.enriched + " enriched.");
}

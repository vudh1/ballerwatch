import assert from "node:assert/strict";
import test from "node:test";
import {
  validRatsVenueUrl, appendVenueObservations, matchVenue, venueNameParts,
} from "../../../backend/shared/venue-directory.mjs";

const RATS = "https://seattlerats.org/venue/bobby-morris-playfield-soccer/";
const GOOGLE = "https://www.google.com/maps/place/Bobby+Morris+Playfield";

test("allowlists actual RATS venue and Google Maps destinations only", () => {
  assert.equal(validRatsVenueUrl(RATS), RATS);
  assert.equal(validRatsVenueUrl(GOOGLE), GOOGLE);
  assert.equal(validRatsVenueUrl("https://seattlerats.org/standings"), "");
  assert.equal(validRatsVenueUrl("https://seattlerats.org.evil.invalid/venue/abc"), "");
  assert.equal(validRatsVenueUrl("https://google.com.evil.invalid/maps/"), "");
  assert.equal(validRatsVenueUrl("http://maps.google.com/?q=47,-122"), "");
});

test("venue cache permanently remembers confirmed links and enriches unresolved venues", () => {
  const first = appendVenueObservations({}, [
    {name: "Bobby Morris Playfield Soccer"},
    {name: "Delridge Soccer Field South", url: "https://maps.google.com/?q=47.5,-122.3"},
  ]);
  assert.equal(first.added, 2);
  const next = appendVenueObservations(first.directory, [
    {name: "Bobby Morris Playfield Soccer", url: RATS, coordinates:{latitude:47.62,longitude:-122.32}},
    {name: "Delridge Soccer Field South", url: "https://maps.google.com/?q=47.6,-122.4"},
  ]);
  assert.equal(next.enriched, 2);
  assert.equal(next.directory.venues.length, 2);
  assert.equal(matchVenue(next.directory, "Bobby Morris Soccer Field").url, RATS);
  assert.deepEqual(matchVenue(next.directory, "Bobby Morris Soccer Field").coordinates,
    {latitude:47.62,longitude:-122.32});
  assert.equal(matchVenue(next.directory, "Delridge Field South").url,
    "https://maps.google.com/?q=47.5,-122.3", "confirmed links never silently change");
});

test("minor typos and omitted unimportant descriptors match, but wrong fields cannot", () => {
  const cache = appendVenueObservations({}, [
    {name:"Queen Anne Bowl Playfield Soccer",url:"https://maps.google.com/?q=47.63,-122.36"},
    {name:"Delridge Playfield North 1",url:"https://maps.google.com/?q=47.51,-122.36"},
    {name:"Delridge Playfield South 2",url:"https://maps.google.com/?q=47.52,-122.36"},
  ]).directory;
  assert.equal(matchVenue(cache,"Queen Ann Bowl Soccer Field").url,
    "https://maps.google.com/?q=47.63,-122.36");
  assert.equal(matchVenue(cache,"Queen Anne Bowl").matchType,"exact");
  assert.equal(matchVenue(cache,"Delridge North Field 1").url,
    "https://maps.google.com/?q=47.51,-122.36");
  assert.equal(matchVenue(cache,"Delridge North Field 2"),null);
  assert.equal(matchVenue(cache,"Delridge Field"),null);
  assert.equal(matchVenue(cache,""),null);
});

test("cache avoids ambiguity and coalesces safe name variants", () => {
  const cache = appendVenueObservations({},[
    {name:"Bobby Morris Playfield Soccer",url:RATS},
    {name:"Bobby Morris Soccer Field",url:RATS},
  ]);
  assert.equal(cache.directory.venues.length,1);
  assert.ok(cache.directory.venues[0].aliases.includes("Bobby Morris Soccer Field"));
  const ambiguous=appendVenueObservations({},[
    {name:"Riverside Memorial Field",url:"https://maps.google.com/?q=47.6,-122.3"},
    {name:"Riverside Memorial Soccer Field",url:"https://maps.google.com/?q=47.5,-122.4"},
  ]);
  assert.equal(matchVenue(ambiguous.directory,"Riverside Memorial Soccer"),null);
  assert.equal(venueNameParts("Delridge #2 South").qualifiers,"2|south");
});

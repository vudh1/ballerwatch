import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverPublishedRatsVenue, ratsVenuePageUrl, readPublishedVenuePage,
} from "../../../backend/league/venue-site.mjs";

const FIELD = "Walt Hundley Playfield - Mod South";
const PAGE = "https://seattlerats.org/venue/walt-hundley-playfield-mod-south/";
const MAP = "https://maps.app.goo.gl/exampleSouth123";

test("new RATS fields produce only same-origin venue-page candidates", () => {
  assert.equal(ratsVenuePageUrl(FIELD), PAGE);
  assert.equal(ratsVenuePageUrl(FIELD, "https://evil.invalid/venue/other"), PAGE);
  assert.equal(ratsVenuePageUrl(FIELD, "https://seattlerats.org/venue/published-name/"),
    "https://seattlerats.org/venue/published-name/");
});

test("a matching published field page supplies its original Maps destination", () => {
  const page = '<html><head><title>Walt Hundley Playfield - Mod South | Seattle RATS</title></head>' +
    '<body><h1>Walt Hundley Playfield - Mod South</h1>' +
    '<a href="https://maps.app.goo.gl/exampleSouth123">Directions</a></body></html>';
  assert.deepEqual(readPublishedVenuePage(page, FIELD, PAGE),
    {sourceUrl:PAGE, mapUrl:MAP});
  assert.equal(readPublishedVenuePage(page, "Walt Hundley Playfield - Mod North", PAGE), null);
  assert.equal(readPublishedVenuePage(page, "Walt Hundley Playfield", PAGE), null);
});

test("rejects generic shell pages and conflicting map links instead of guessing", () => {
  const shell = '<title>Seattle RATS | Adult Soccer</title><a href="' + MAP + '">Maps</a>';
  assert.equal(readPublishedVenuePage(shell, FIELD, PAGE), null);
  const ambiguous = '<h1>Walt Hundley Playfield - Mod South</h1>' +
    '<a href="' + MAP + '">Maps</a>' +
    '<a href="https://maps.google.com/?q=47.61,-122.32">Directions</a>';
  assert.equal(readPublishedVenuePage(ambiguous, FIELD, PAGE), null);
  const wrongHost = '<h1>Walt Hundley Playfield - Mod South</h1>' +
    '<a href="https://google.com.evil.invalid/maps/field">Maps</a>';
  assert.deepEqual(readPublishedVenuePage(wrongHost, FIELD, PAGE),
    {sourceUrl:PAGE, mapUrl:""});
});

test("discoverer stays within RATS and never follows redirects", async () => {
  const calls = [];
  const result = await discoverPublishedRatsVenue(FIELD, "", {
    fetchImpl: async (url, options) => {
      calls.push({url, options});
      return {
        ok:true, headers:{get:()=> "text/html"},
        text:async () => '<title>Walt Hundley Playfield - Mod South</title>' +
          '<a href="' + MAP + '">Directions</a>',
      };
    },
  });
  assert.deepEqual(result, {sourceUrl:PAGE,mapUrl:MAP});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PAGE);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(await discoverPublishedRatsVenue(FIELD, "", {
    fetchImpl: async () => { throw new Error("blocked"); },
  }), null);
});

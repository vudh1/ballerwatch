import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  HEADERS,
  aggregateVenueDirectory,
  HttpError,
  call,
  calendarFingerprint,
  canRetainPreviousSchedule,
  discoverLatestSeason,
  edgeSignalAggregate,
  eventScore,
  isTransientSourceError,
  normalize,
  publishedVenueUrl,
  publishedVenueCoordinates,
  validPublishedVenueUrl,
  validPreviousSchedule,
} from "../../../backend/league/watcher.mjs";

const TEAM_NAMES = ["Team Alpha", "Team Beta"];

function fixtures() {
  return {
    aggregate: {
      teams: [
        {
          name: "Team Alpha",
          day: "Monday",
          gender: "Men's",
          division: "3 8v8",
          color_alt: "Black",
          schedule_key: "a",
        },
        {
          name: "Team Beta",
          day: "Tuesday",
          gender: "Men's",
          division: "2c 8v8",
          color_alt: "White",
          schedule_key: "b",
        },
      ],
      events: [
        {
          home_team_name: "Team Alpha",
          away_team_name: "Opponent",
          location: "Field",
          notes: "Set up goals",
          start_date: "2026-10-05",
          start_time: "19:15:00",
          home_color: "White",
          away_color: "White",
        },
      ],
    },
    exportsByTeam: {
      "Team Alpha": [
        HEADERS,
        [
          "game", "2026-10-05", "19:15:00", "", "", "US/Pacific", "Home",
          "Opponent", "Field", "Black", "White", "Yes", "Yes", "Set up goals",
        ],
      ],
      "Team Beta": [
        HEADERS,
        [
          "bye", "2026-10-06", "", "", "", "US/Pacific", "", "", "", "",
          "", "Yes", "Yes", "",
        ],
      ],
    },
  };
}

function normalized(data = fixtures()) {
  return normalize("fall-2026", data.aggregate, data.exportsByTeam, {teamNames: TEAM_NAMES});
}

test("preferred season is tried first", async () => {
  const {aggregate} = fixtures();
  const calls = [];
  const [season, returned] = await discoverLatestSeason("fall-2026", {
    teamNames: TEAM_NAMES,
    callFn: async (action, params) => {
      calls.push([action, params]);
      return aggregate;
    },
    now: new Date("2026-10-01T12:00:00-07:00"),
  });
  assert.equal(season, "fall-2026");
  assert.equal(returned, aggregate);
  assert.deepEqual(calls, [["get-aggregate", {season: "fall-2026"}]]);
});

test("preferred season transient outage stops discovery immediately", async () => {
  const calls = [];
  await assert.rejects(
    discoverLatestSeason("fall-2026", {
      teamNames: TEAM_NAMES,
      callFn: async (action, params) => {
        calls.push([action, params]);
        throw new HttpError(500);
      },
      now: new Date("2026-10-01T12:00:00-07:00"),
    }),
    /HTTP 500/,
  );
  assert.deepEqual(calls, [["get-aggregate", {season: "fall-2026"}]]);
});

test("fresh edge signal replaces duplicate aggregate fetch", () => {
  const {aggregate} = fixtures();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-edge-"));
  const file = path.join(dir, "edge-signal.json");
  fs.writeFileSync(file, JSON.stringify({season: "fall-2026", ...aggregate}));
  const result = edgeSignalAggregate("fall-2026", {
    teamNames: TEAM_NAMES,
    externalFallback: "false",
    file,
  });
  assert.equal(result[0], "fall-2026");
  assert.equal(result[1].teams.length, 2);
});

test("external fallback ignores cached edge signal", () => {
  assert.equal(
    edgeSignalAggregate("fall-2026", {
      teamNames: TEAM_NAMES,
      externalFallback: "true",
      file: "/does/not/matter",
    }),
    null,
  );
});

test("normalization preserves counts, colors, tracking keys, and Pacific time", () => {
  const output = normalized();
  assert.deepEqual(output.teams.map((team) => team.publishedMatchCount), [1, 0]);
  const game = output.teams[0].matches[0];
  assert.equal(game.jerseyColor, "Black");
  assert.equal(game.opponentJerseyColor, "White");
  assert.equal(game.start, "2026-10-05T19:15:00-07:00");
  assert.equal(game.end, "2026-10-05T21:15:00-07:00");
  assert.equal(game.endEstimated, true);
  assert.equal(game.key, "v2:26c0505cec80b23df5c52d7e");
});

test("published end time is preserved", () => {
  const data = fixtures();
  data.exportsByTeam["Team Alpha"][1][3] = "2026-10-05";
  data.exportsByTeam["Team Alpha"][1][4] = "21:00:00";
  const game = normalized(data).teams[0].matches[0];
  assert.equal(game.endEstimated, false);
  assert.equal(game.end, "2026-10-05T21:00:00-07:00");
});

test("division and published weekday are dynamic", () => {
  const data = fixtures();
  data.aggregate.teams[0].day = "Wednesday";
  data.aggregate.teams[0].division = "2 8v8";
  const output = normalized(data);
  assert.equal(output.teams[0].day, "Wednesday");
  assert.equal(output.teams[0].division, "Wednesday Men's D-2 8v8");
});

test("team matching ignores case and collapses spaces", () => {
  const data = fixtures();
  data.aggregate.teams[0].name = "  TEAM ALPHA  ";
  data.aggregate.events[0].home_team_name = "  TEAM ALPHA  ";
  data.aggregate.teams[1].name = "Team   Beta";
  const output = normalized(data);
  assert.equal(output.teams[0].name, "  TEAM ALPHA  ");
  assert.equal(output.teams[0].matches[0].team, "  TEAM ALPHA  ");
  assert.equal(output.teams[1].name, "Team   Beta");
});

test("aggregate-only extra event is ignored", () => {
  const data = fixtures();
  data.aggregate.events.push({
    home_team_name: "Team Alpha",
    away_team_name: "Extra Team",
    location: "Field 2",
    notes: "",
    start_date: "2026-10-19",
    start_time: "20:30:00",
    home_color: "White",
    away_color: "Blue",
  });

  const output = normalized(data);
  assert.equal(output.teams[0].publishedMatchCount, 1);
});

test("source mismatches and malformed schemas fail closed", () => {
  const mismatch = fixtures();
  mismatch.exportsByTeam["Team Alpha"][1][8] = "Another field";
  assert.throws(() => normalized(mismatch), /Source changed during fetch/);

  assert.throws(
    () => normalize("fall-2026", {}, {}, {teamNames: TEAM_NAMES}),
    /Unrecognized aggregate schema/,
  );

  const duplicate = fixtures();
  duplicate.aggregate.events.push(structuredClone(duplicate.aggregate.events[0]));
  assert.throws(() => normalized(duplicate), /game count mismatch|duplicate match identities/i);
});

test("RATS aggregate score strings map to home and away numeric scores", () => {
  const event = { score: " 4-0 " };
  assert.equal(eventScore(event, "home"), 4);
  assert.equal(eventScore(event, "away"), 0);
  assert.equal(eventScore({ score: "2–3" }, "home"), 2);
  assert.equal(eventScore({ score: "2–3" }, "away"), 3);
});

test("metadata changes fingerprint but score-only changes do not", () => {
  const before = normalized().teams[0].matches[0];

  const metadata = fixtures();
  metadata.aggregate.events[0].home_color = "Blue";
  const after = normalized(metadata).teams[0].matches[0];
  assert.equal(before.key, after.key);
  assert.notEqual(before.calendarFingerprint, after.calendarFingerprint);

  const scored = {...before, teamScore: 3, opponentScore: 2};
  assert.equal(calendarFingerprint(before), calendarFingerprint(scored));
});

test("DST switches to Pacific standard time in November", () => {
  const data = fixtures();
  data.aggregate.events[0].start_date = "2026-11-02";
  data.exportsByTeam["Team Alpha"][1][1] = "2026-11-02";
  const game = normalized(data).teams[0].matches[0];
  assert.ok(game.start.endsWith("-08:00"));
});

test("transient errors are narrowly classified", () => {
  assert.equal(isTransientSourceError(new HttpError(500)), true);
  assert.equal(isTransientSourceError(new HttpError(503)), true);
  assert.equal(isTransientSourceError(new HttpError(401)), false);
  assert.equal(isTransientSourceError(new HttpError(501)), false);
  assert.equal(isTransientSourceError(new Error("schema changed")), false);
});

test("RATS call retries transient errors then succeeds", async () => {
  const responses = [
    {ok: false, status: 500},
    {ok: false, status: 502},
    {ok: true, status: 200, json: async () => ({ok: true})},
  ];
  const sleeps = [];
  let calls = 0;
  const result = await call("test", {x: 1}, {
    fetchImpl: async () => {
      calls += 1;
      return responses.shift();
    },
    sleepFn: async (ms) => sleeps.push(ms),
  });
  assert.deepEqual(result, {ok: true});
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test("permanent RATS error is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    call("test", {x: 1}, {
      fetchImpl: async () => {
        calls += 1;
        return {ok: false, status: 401};
      },
      sleepFn: async () => assert.fail("must not sleep"),
    }),
    /HTTP 401/,
  );
  assert.equal(calls, 1);
});

test("only verified last-good schedules can mask transient outages", () => {
  const previous = {ok: true, teams: []};
  assert.equal(validPreviousSchedule(previous), true);
  assert.equal(validPreviousSchedule({ok: false, teams: []}), false);
  assert.equal(validPreviousSchedule(null), false);
  assert.equal(canRetainPreviousSchedule(new HttpError(500), previous), true);
  assert.equal(canRetainPreviousSchedule(new HttpError(503), previous), true);
  assert.equal(canRetainPreviousSchedule(new Error("schema"), previous), false);
  assert.equal(canRetainPreviousSchedule(new HttpError(503), null), false);
});

test("RATS published field URLs and venue coordinates survive schedule normalization", () => {
  const data = fixtures();
  const event = data.aggregate.events[0];
  event.location_url = "https://www.google.com/maps/place/Synthetic+Soccer+Field/@47.617,-122.322,17z";
  event.venue = {latitude: 47.617, longitude: -122.322};
  const game = normalized(data).teams[0].matches[0];
  assert.equal(game.locationUrl, event.location_url);
  assert.equal(game.mapUrl, event.location_url);
  assert.deepEqual(game.venueCoordinates, {latitude: 47.617, longitude: -122.322});
  assert.equal(publishedVenueUrl({location_link:"https://seattlerats.org/venue/soccer-field/"}),
    "https://seattlerats.org/venue/soccer-field/");
  assert.deepEqual(publishedVenueCoordinates({lat:"47.6",lon:"-122.3"}),
    {latitude:47.6,longitude:-122.3});
});

test("RATS venue URL validation prevents arbitrary links and invalid coordinates", () => {
  assert.equal(validPublishedVenueUrl("https://google.com.evil.example/maps/"), "");
  assert.equal(validPublishedVenueUrl("https://maps.google.com.evil.example/?q=x"), "");
  assert.equal(validPublishedVenueUrl("https://evil.example/venue/field"), "");
  assert.equal(validPublishedVenueUrl("http://www.google.com/maps?q=47,-122"), "");
  assert.equal(publishedVenueUrl({notes:"Directions https://maps.app.goo.gl/abc123"}),
    "https://maps.app.goo.gl/abc123");
  assert.equal(publishedVenueCoordinates({latitude:0,longitude:0}), null);
  assert.equal(publishedVenueCoordinates({latitude:991,longitude:0}), null);
});

test("fixture links resolve from the RATS venue catalogue without mixing subdivisions", () => {
  const data = fixtures();
  const location = "Walt Hundley Playfield - Mod South";
  data.aggregate.events[0].location = location;
  data.exportsByTeam["Team Alpha"][1][8] = location;
  data.aggregate.venues = [
    {name:"Walt Hundley Playfield - Mod North", maps_url:"https://maps.app.goo.gl/north123"},
    {name:location, google_maps_url:"https://maps.app.goo.gl/south123"},
  ];
  const directory = aggregateVenueDirectory(data.aggregate);
  assert.equal(directory.venues.length, 2);
  assert.equal(normalized(data).teams[0].matches[0].locationUrl,
    "https://maps.app.goo.gl/south123");
  delete data.aggregate.venues[1].google_maps_url;
  assert.equal(normalized(data).teams[0].matches[0].locationUrl, "",
    "never borrow the North destination for Mod South");

  data.aggregate.locations = {
    [location]: "https://maps.app.goo.gl/south456",
  };
  assert.equal(normalized(data).teams[0].matches[0].locationUrl,
    "https://maps.app.goo.gl/south456");
});

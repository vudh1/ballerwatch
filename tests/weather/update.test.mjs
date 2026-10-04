import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  addDaysIso,
  collectUpcomingGames,
  summarizeMatchWeather,
  weatherCondition,
} from "../../weather/update.mjs";

test("collectUpcomingGames returns located pickup and league games within 14 days", () => {
  const result = collectUpcomingGames({
    now: new Date("2099-10-01T12:00:00-07:00"),
    pickupFeed: {
      events: {
        "2099-10-02": {
          reserved: 12,
          capacity: 16,
          startTime: "20:30",
          endTime: "22:30",
        },
        "2099-10-20": { startTime: "20:00", endTime: "22:00" },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-02": {
          fieldName: "Washington Park Soccer",
          address: "Seattle, WA",
        },
        "2099-10-20": { fieldName: "Too late" },
      },
    },
    leagueSchedule: {
      teams: [{
        name: "Team Alpha",
        matches: [{
          key: "v2:abc",
          date: "2099-10-05",
          startTime: "19:15",
          endTime: null,
          start: "2099-10-05T19:15:00-07:00",
          end: "2099-10-05T21:15:00-07:00",
          team: "Team Alpha",
          opponent: "Team Beta",
          location: "Field One",
        }],
      }],
    },
  });

  assert.equal(result.startDate, "2099-10-01");
  assert.equal(result.endDate, "2099-10-14");
  const sourceGames = result.games.filter((game) => game.kind !== "free_pickup");
  assert.deepEqual(sourceGames.map((game) => game.id), [
    "pickup:2099-10-02",
    "league:v2:abc",
  ]);
  assert.equal(sourceGames[0].startTime, "20:30");
  assert.equal(sourceGames[1].endTime, "21:15");
});

test("summarizeMatchWeather uses the actual match window and maximum rain probability", () => {
  const weather = summarizeMatchWeather(
    {
      date: "2099-10-02",
      startTime: "20:30",
      endTime: "22:30",
    },
    {
      time: [
        "2099-10-02T19:00",
        "2099-10-02T20:00",
        "2099-10-02T21:00",
        "2099-10-02T22:00",
        "2099-10-02T23:00",
      ],
      precipitation_probability: [99, 10, 70, 45, 95],
      temperature_2m: [66, 64, 62, 60, 59],
      weather_code: [95, 2, 61, 80, 95],
    },
  );

  assert.equal(weather.rainProbability, 70);
  assert.equal(weather.temperatureF, 62);
  assert.equal(weather.condition, "Rain");
});

test("weather helpers support 14-day range and common WMO conditions", () => {
  assert.equal(addDaysIso("2099-10-01", 13), "2099-10-14");
  assert.equal(weatherCondition(0), "Clear");
  assert.equal(weatherCondition(61), "Rain");
  assert.equal(weatherCondition(95), "Thunderstorms");
});


test("weather request stays inside the two-week free-tier window", () => {
  const source = fs.readFileSync("weather/update.mjs", "utf8");
  assert.match(source, /forecast_days", "14"/);
  assert.doesNotMatch(source, /forecast_days", "16"/);
});


test("league weather fallback is explicitly bounded to Seattle RATS games", () => {
  const source = fs.readFileSync("weather/update.mjs", "utf8");
  assert.match(source, /SEATTLE_WEATHER_FALLBACK/);
  assert.match(source, /game\.kind === "league"/);
  assert.match(source, /source: "seattle-fallback"/);
  assert.match(source, /weatherApproximate/);
  assert.match(source, /Weather game \$\{game\.date\}/);
});


test("summarizeMatchWeather handles a match that crosses midnight", () => {
  const weather = summarizeMatchWeather(
    {
      date: "2099-10-02",
      startTime: "23:30",
      endTime: "00:30",
    },
    {
      time: [
        "2099-10-02T22:00",
        "2099-10-02T23:00",
        "2099-10-03T00:00",
        "2099-10-03T01:00",
      ],
      precipitation_probability: [99, 25, 60, 98],
      temperature_2m: [58, 56, 54, 52],
      weather_code: [95, 2, 61, 95],
    },
  );

  assert.equal(weather.rainProbability, 60);
  assert.equal(weather.temperatureF, 55);
  assert.equal(weather.condition, "Rain");
});

test("Open-Meteo forecast requests Pacific-local hourly timestamps", () => {
  const source = fs.readFileSync("weather/update.mjs", "utf8");
  assert.match(source, /const TIME_ZONE = "America\/Los_Angeles"/);
  assert.match(source, /url\.searchParams\.set\("timezone", TIME_ZONE\)/);
  assert.match(
    source,
    /"precipitation_probability,temperature_2m,weather_code"/,
  );
});


test("manual match overrides drive weather date, time, location, and stable IDs", () => {
  const result = collectUpcomingGames({
    pickupFeed: {
      events: {
        "2026-10-06": {
          ok: true,
          startTime: "20:00",
          endTime: "22:00",
          reserved: 10,
          capacity: 16,
        },
      },
    },
    pickupPrivate: {
      events: {
        "2026-10-06": {
          fieldName: "Source Pickup Field",
          address: "Source Pickup Address",
        },
      },
    },
    leagueSchedule: {
      teams: [{
        name: "Team Alpha",
        matches: [{
          key: "v2:weather-override",
          team: "Team Alpha",
          opponent: "Team Beta",
          date: "2026-10-07",
          startTime: "19:00",
          endTime: "21:00",
          start: "2026-10-07T19:00:00-07:00",
          end: "2026-10-07T21:00:00-07:00",
          location: "Source League Field",
        }],
      }],
    },
    settings: {
      matchOverrides: {
        "pickup:2026-10-06": {
          id: "pickup:2026-10-06",
          kind: "pickup",
          date: "2026-10-08",
          startTime: "21:00",
          endTime: "23:00",
          location: "Manual Pickup Field",
          updatedAt: "2026-10-03T20:00:00Z",
        },
        "league:v2:weather-override": {
          id: "league:v2:weather-override",
          kind: "league",
          date: "2026-10-09",
          startTime: "20:30",
          endTime: "22:00",
          location: "Manual League Field",
          updatedAt: "2026-10-03T20:00:00Z",
        },
      },
    },
    now: new Date("2026-10-03T12:00:00-07:00"),
    days: 14,
  });

  const pickup = result.games.find((game) => game.kind === "pickup");
  const league = result.games.find((game) => game.kind === "league");
  assert.equal(pickup.id, "pickup:2026-10-06");
  assert.equal(pickup.date, "2026-10-08");
  assert.equal(pickup.startTime, "21:00");
  assert.equal(pickup.location, "Manual Pickup Field");
  assert.equal(league.id, "league:v2:weather-override");
  assert.equal(league.date, "2026-10-09");
  assert.equal(league.startTime, "20:30");
  assert.equal(league.location, "Manual League Field");
});


test("weather includes synthetic Jefferson Park Saturdays only through the source horizon", () => {
  const result = collectUpcomingGames({
    pickupFeed: {
      events: {
        "2026-10-20": {
          ok: true,
          startTime: "20:00",
          endTime: "22:00",
          reserved: 8,
          capacity: 16,
        },
      },
    },
    pickupPrivate: {
      events: {
        "2026-10-20": {
          fieldName: "RSVP Field",
          address: "Seattle, WA",
        },
      },
    },
    leagueSchedule: { teams: [] },
    settings: {},
    now: new Date("2026-10-03T08:00:00-07:00"),
    days: 14,
  });

  const free = result.games.filter((game) => game.kind === "free_pickup");
  assert.deepEqual(free.map((game) => game.date), [
    "2026-10-03",
    "2026-10-10",
  ]);
  assert.ok(free.every((game) => game.location === "Jefferson Park Playfield"));
  assert.ok(free.every((game) => game.startTime === "10:30"));
});

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
  assert.deepEqual(result.games.map((game) => game.id), [
    "pickup:2099-10-02",
    "league:v2:abc",
  ]);
  assert.equal(result.games[0].startTime, "20:30");
  assert.equal(result.games[1].endTime, "21:15");
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
      precipitation_probability: [5, 10, 70, 45, 0],
      temperature_2m: [66, 64, 62, 60, 59],
      weather_code: [1, 2, 61, 80, 0],
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

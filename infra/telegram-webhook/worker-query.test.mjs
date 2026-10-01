import test from "node:test";
import assert from "node:assert/strict";
import { gamesOnDate, nextGame, resolveScheduleDate } from "./worker.mjs";

function snapshot() {
  return {
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 14,
          capacity: 16,
          startTime: "20:00:00",
          endTime: "22:00:00",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Test Field",
          players: [],
          waitlist: [],
        },
      },
    },
    league: {
      teams: [
        {
          name: "Team Alpha",
          matches: [
            {
              team: "Team Alpha",
              opponent: "Team Beta",
              date: "2099-10-05",
              startTime: "19:00:00",
              location: "League Field",
              jerseyColor: "Black",
            },
          ],
        },
      ],
    },
    settings: {},
    ownerName: "",
  };
}

test("date schedule queries resolve league-only dates", () => {
  assert.equal(resolveScheduleDate("what games are on 2099-10-05?", snapshot()), "2099-10-05");
});

test("date schedule reply combines available published data", () => {
  const league = gamesOnDate(snapshot(), "2099-10-05");
  assert.match(league, /Team Alpha vs Team Beta/);
  assert.match(league, /League Field/);

  const pickup = gamesOnDate(snapshot(), "2099-10-08");
  assert.match(pickup, /14\/16 reserved/);
  assert.match(pickup, /Test Field/);
});

test("next game considers both league and pickup schedules", () => {
  const result = nextGame(snapshot());
  assert.equal(result.date, "2099-10-05");
  assert.match(result.reply, /Team Alpha vs Team Beta/);
});

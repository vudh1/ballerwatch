import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dedupeWebBoardEntries,
  directIntent,
  issueOwnerToken,
  issuePushRegistrationChallenge,
  pickupUserRsvpView,
  verifyOwnerCapability,
  normalizeOwnerSettingsInput,
  verifyOwnerToken,
  verifyPushRegistrationChallenge,
  validWebSubscription,
  webCalendarDetails,
  webNextGameDetails,
  webSafeSnapshot,
} from "../../../infra/web-worker/worker.mjs";

test("web snapshot strips private pickup roster and owner settings", () => {
  const safe = webSafeSnapshot({
    pickup: { dates: [{ date: "2099-10-08" }], events: {} },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Public Field",
          address: "123 Public Field Rd",
          locked: true,
          players: [{ name: "Private Person" }],
          waitlist: [{ name: "Private Waitlist" }],
        },
      },
    },
    league: { teams: [] },
    today: { games: [] },
    teams: ["Team Alpha"],
    settings: { ownerRsvpName: "Private Owner", snoozeUntil: "secret" },
    version: "3.0.0",
  });

  assert.equal(safe.pickupPrivate.events["2099-10-08"].fieldName, "Public Field");
  assert.deepEqual(safe.pickupPrivate.events["2099-10-08"].players, []);
  assert.deepEqual(safe.pickupPrivate.events["2099-10-08"].waitlist, []);
  assert.deepEqual(safe.settings, {});
  assert.equal(safe.ownerName, "");
  assert.doesNotMatch(JSON.stringify(safe), /Private Person|Private Owner|secret/);
});


test("authenticated pickup RSVP view exposes only confirmed and waitlisted dates", () => {
  const view = pickupUserRsvpView({
    pickup: {
      dates: [
        { date: "2099-10-08" },
        { date: "2099-10-15" },
        { date: "2099-10-22" },
      ],
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          players: [{ name: "Alex Smith" }, { name: "Someone Else" }],
          waitlist: [],
        },
        "2099-10-15": {
          players: [],
          waitlist: [{ name: "Alex Smith" }],
        },
        "2099-10-22": {
          players: [{ name: "Someone Else" }],
          waitlist: [],
        },
      },
    },
    settings: { ownerRsvpName: "Alex Smith" },
  });

  assert.deepEqual(view, {
    confirmedDates: ["2099-10-08"],
    waitlistedDates: ["2099-10-15"],
  });
  assert.doesNotMatch(JSON.stringify(view), /Alex Smith|Someone Else/);
});

test("web user capability verification honors the current auth revision", async () => {
  const env = { TRACKER_STATE_KEY: "test-runtime-key" };
  const issued = await issueOwnerToken(env, 3);
  assert.equal(await verifyOwnerCapability(env, "", { webAuthVersion: 3 }), false);
  assert.equal(await verifyOwnerCapability(env, issued.token, { webAuthVersion: 3 }), true);
  assert.equal(await verifyOwnerCapability(env, issued.token, { webAuthVersion: 4 }), false);
});


test("web push subscription accepts only recognized browser push endpoints", () => {
  const endpoint = "https://updates.push.services.mozilla.com/wpush/v2/synthetic";
  const subscription = validWebSubscription({
    endpoint,
    expirationTime: null,
    keys: { p256dh: "key", auth: "auth" },
  });
  assert.equal(subscription.endpoint, endpoint);
  assert.equal(validWebSubscription({
    endpoint: "https://example.test/push",
    keys: { p256dh: "key", auth: "auth" },
  }), null);
  assert.equal(validWebSubscription({
    endpoint: "https://127.0.0.1/push",
    keys: { p256dh: "key", auth: "auth" },
  }), null);
  assert.equal(validWebSubscription({
    endpoint: "https://user:pass@updates.push.services.mozilla.com/wpush/v2/synthetic",
    keys: { p256dh: "key", auth: "auth" },
  }), null);
  assert.equal(validWebSubscription({ endpoint }), null);
});


test("web next-game details remain public-safe and prefer the earliest future game", () => {
  const details = webNextGameDetails({
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 12,
          capacity: 16,
          startTime: "20:30",
          endTime: "22:30",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Washington Park Soccer",
          address: "101 Public Field Rd",
          players: [{ name: "Private Person" }],
          waitlist: [{ name: "Private Waitlist" }],
        },
      },
    },
    pickupSourceHealth: { checkedAt: "2099-10-01T12:34:00Z" },
    league: {
      updatedAt: "2099-10-01T13:45:00-07:00",
      teams: [{
        name: "Team Alpha",
        matches: [{
          date: "2099-10-10",
          startTime: "21:00",
          opponent: "Team Beta",
          location: "League Field",
          jerseyColor: "Blue",
        }],
      }],
    },
  });

  assert.equal(details.kind, "pickup");
  assert.equal(details.date, "2099-10-08");
  assert.equal(details.title, "Pickup");
  assert.equal(details.location, "Washington Park Soccer");
  assert.equal(details.mapsQuery, "101 Public Field Rd");
  assert.equal(details.rsvpUrl, "https://nhcuong95.github.io/rsvp/?date=2099-10-08");
  assert.equal(details.sourceUpdatedAt, "2099-10-01T12:34:00Z");
  assert.doesNotMatch(JSON.stringify(details), /Private Person|Private Waitlist/);
});


test("web slash commands map to read-only intents", () => {
  assert.equal(directIntent("/today"), "today_games");
  assert.equal(directIntent("/next"), "next_game");
  assert.equal(directIntent("/teams"), "league_teams");
  assert.equal(directIntent("/count Thursday"), "pickup_status");
  assert.equal(directIntent("/field Thursday"), "pickup_status");
  assert.equal(directIntent("/time Thursday"), "pickup_status");
  assert.equal(directIntent("Thursday time"), "pickup_status");
  assert.equal(directIntent("/version"), "version");
  assert.equal(directIntent("/help"), "help");
});

test("league next-game details expose a two-hour time window from normalized end time", () => {
  const details = webNextGameDetails({
    pickup: { dates: [], events: {} },
    pickupPrivate: { events: {} },
    league: {
      updatedAt: "2099-10-01T13:45:00-07:00",
      teams: [{
        name: "Team Alpha",
        matches: [{
          date: "2099-10-10",
          startTime: "19:30:00",
          start: "2099-10-10T19:30:00-07:00",
          end: "2099-10-10T21:30:00-07:00",
          opponent: "Team Beta",
          location: "League Field",
        }],
      }],
    },
  });

  assert.equal(details.kind, "league");
  assert.equal(details.time, "7:30 PM–9:30 PM");
  assert.equal(details.sourceUpdatedAt, "2099-10-01T13:45:00-07:00");
});


test("user capability tokens are revision-bound for server-side revocation", async () => {
  const env = { TRACKER_STATE_KEY: "test-owner-secret" };
  const issued = await issueOwnerToken(env, 3);
  assert.match(issued.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(await verifyOwnerToken(env, issued.token, 3), true);
  assert.equal(await verifyOwnerToken(env, issued.token, 2), false);
  assert.equal(await verifyOwnerToken(env, issued.token, 4), false);
  assert.equal(await verifyOwnerToken(env, issued.token + "x", 3), false);
  assert.equal(await verifyOwnerToken({TRACKER_STATE_KEY: "wrong"}, issued.token, 3), false);
});

test("push registration challenge is short-lived and bound to one recognized endpoint", async () => {
  const env = { TRACKER_STATE_KEY: "test-push-challenge-secret" };
  const endpoint = "https://updates.push.services.mozilla.com/wpush/v2/synthetic";
  const other = "https://fcm.googleapis.com/fcm/send/other";
  const token = await issuePushRegistrationChallenge(env, endpoint);
  assert.equal(await verifyPushRegistrationChallenge(env, token, endpoint), true);
  assert.equal(await verifyPushRegistrationChallenge(env, token, other), false);
  assert.equal(await verifyPushRegistrationChallenge(env, token + "x", endpoint), false);
});

test("owner settings input normalizes and deduplicates teams", () => {
  const settings = normalizeOwnerSettingsInput({
    ownerName: "  Alex Smith  ",
    teams: [" Team Alpha ", "team alpha", "Team Beta"],
  });
  assert.equal(settings.ownerName, "Alex Smith");
  assert.deepEqual(settings.teams, ["Team Alpha", "Team Beta"]);
  assert.throws(
    () => normalizeOwnerSettingsInput({ownerName: "Alex", teams: []}),
    /1 and 20/,
  );
});


test("web calendar merges public games with cached match-window weather", () => {
  const snapshot = {
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 12,
          capacity: 16,
          startTime: "20:30",
          endTime: "22:30",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Washington Park Soccer",
          address: "Seattle, WA",
          players: [{ name: "Private Person" }],
        },
      },
    },
    pickupSourceHealth: { checkedAt: "2099-10-01T10:15:00Z" },
    league: { teams: [] },
    today: { games: [] },
  };
  const weather = {
    updatedAt: "2099-10-01T12:00:00Z",
    refreshHours: 6,
    games: [{
      id: "pickup:2099-10-08",
      weather: {
        rainProbability: 65,
        temperatureF: 58,
        weatherCode: 61,
        condition: "Rain",
      },
    }],
  };

  const calendar = webCalendarDetails(snapshot, weather, 14, "2099-10-01");
  assert.equal(calendar.games.length, 1);
  assert.equal(calendar.games[0].id, "pickup:2099-10-08");
  assert.equal(calendar.games[0].rsvpUrl, "https://nhcuong95.github.io/rsvp/?date=2099-10-08");
  assert.equal(calendar.games[0].sourceUpdatedAt, "2099-10-01T10:15:00Z");
  assert.equal(calendar.games[0].weather.rainProbability, 65);
  assert.equal(calendar.games[0].weather.temperatureF, 58);
  assert.doesNotMatch(JSON.stringify(calendar), /Private Person/);
  assert.equal(calendar.refreshHours, 6);
});


test("web calendar keeps future league matches beyond the 14-day weather window", () => {
  const snapshot = {
    pickup: {
      dates: [
        { date: "2099-10-08" },
        { date: "2099-10-20" },
      ],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 8,
          capacity: 16,
          startTime: "20:00",
          endTime: "22:00",
        },
        "2099-10-20": {
          ok: true,
          reserved: 8,
          capacity: 16,
          startTime: "20:00",
          endTime: "22:00",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Near Pickup Field",
          address: "Seattle, WA",
        },
        "2099-10-20": {
          fieldName: "Far Pickup Field",
          address: "Seattle, WA",
        },
      },
    },
    league: {
      teams: [{
        name: "Team Alpha",
        matches: [
          {
            key: "v2:near-league",
            date: "2099-10-06",
            startTime: "20:00",
            endTime: "22:00",
            team: "Team Alpha",
            opponent: "Team Beta",
            location: "Near League Field",
          },
          {
            key: "v2:far-league",
            date: "2099-10-20",
            startTime: "20:00",
            endTime: "22:00",
            team: "Team Alpha",
            opponent: "Team Gamma",
            location: "Far League Field",
          },
        ],
      }],
    },
  };

  const calendar = webCalendarDetails(snapshot, {}, 14, "2099-10-01");
  assert.deepEqual(
    calendar.games.map((game) => [game.kind, game.date]),
    [
      ["league", "2099-10-06"],
      ["pickup", "2099-10-08"],
      ["league", "2099-10-20"],
    ],
  );
});

test("calendar exposes approximate weather markers", () => {
  const snapshot = {
    pickup: { dates: [], events: {} },
    pickupPrivate: { events: {} },
    league: {
      teams: [{
        name: "Team Alpha",
        matches: [{
          key: "v2:weather-fallback",
          date: "2099-10-06",
          start: "2099-10-06T19:00:00-07:00",
          end: "2099-10-06T21:00:00-07:00",
          team: "Team Alpha",
          opponent: "Team Beta",
          location: "Unresolved League Field",
        }],
      }],
    },
  };
  const weatherState = {
    games: [{
      id: "league:v2:weather-fallback",
      weather: {
        rainProbability: 30,
        temperatureF: 58,
        weatherCode: 2,
        condition: "Partly cloudy",
      },
      weatherApproximate: true,
    }],
  };
  const calendar = webCalendarDetails(snapshot, weatherState, 14, "2099-10-01");
  assert.equal(calendar.games[0].weatherApproximate, true);
  assert.equal(calendar.games[0].weather.rainProbability, 30);
});


test("completed current-day match is excluded from next game and calendar", () => {
  const snapshot = {
    pickup: {
      dates: [
        { date: "2099-10-08" },
        { date: "2099-10-09" },
      ],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 16,
          capacity: 16,
          startTime: "20:30",
          endTime: "22:30",
        },
        "2099-10-09": {
          ok: true,
          reserved: 10,
          capacity: 16,
          startTime: "20:00",
          endTime: "22:00",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Old Field",
          address: "Seattle, WA",
        },
        "2099-10-09": {
          fieldName: "Next Field",
          address: "Seattle, WA",
        },
      },
    },
    league: { teams: [] },
  };

  const now = new Date("2099-10-08T22:31:00-07:00");
  const next = webNextGameDetails(snapshot, now);
  assert.equal(next.date, "2099-10-09");
  assert.equal(next.location, "Next Field");

  const calendar = webCalendarDetails(
    snapshot,
    {},
    14,
    "2099-10-08",
    now,
  );
  assert.deepEqual(calendar.games.map((game) => game.date), ["2099-10-09"]);
});

test("current match remains eligible until its end time", () => {
  const snapshot = {
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 12,
          capacity: 16,
          startTime: "20:30",
          endTime: "22:30",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "Current Field",
          address: "Seattle, WA",
        },
      },
    },
    league: { teams: [] },
  };

  const details = webNextGameDetails(
    snapshot,
    new Date("2099-10-08T22:29:00-07:00"),
  );
  assert.equal(details.date, "2099-10-08");
});


test("web board keeps only the newest copy of identical historical notifications", () => {
  const entries = [
    {
      id: "new",
      channel: "pickup",
      createdAt: "2026-10-02T16:26:00Z",
      title: "Pickup update",
      body: "12/16 reserved - Wed 10/7",
      url: "https://vudh1.github.io/ballerwatch/",
      tag: "pickup-2026-10-07",
    },
    {
      id: "old",
      channel: "pickup",
      createdAt: "2026-10-02T15:24:00Z",
      title: "Pickup update",
      body: "12/16 reserved - Wed 10/7",
      url: "https://vudh1.github.io/ballerwatch/",
      tag: "pickup-2026-10-07",
    },
    {
      id: "changed",
      channel: "pickup",
      createdAt: "2026-10-02T14:20:00Z",
      title: "Pickup update",
      body: "11/16 reserved - Wed 10/7",
      url: "https://vudh1.github.io/ballerwatch/",
      tag: "pickup-2026-10-07",
    },
  ];

  assert.deepEqual(
    dedupeWebBoardEntries(entries).map((entry) => entry.id),
    ["new", "changed"],
  );
});


test("web feedback keeps original question and answer before encrypted review dispatch", () => {
  const source = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  assert.match(source, /function retainPrivateText/);
  assert.match(source, /question:\s*retainPrivateText\(event\.question, 4000\)/);
  assert.match(source, /reply:\s*retainPrivateText\(event\.reply, 12000\)/);
  assert.match(source, /const question = retainPrivateText\(body\?\.question, 4000\)/);
  assert.match(source, /const reply = retainPrivateText\(body\?\.reply, 12000\)/);
});

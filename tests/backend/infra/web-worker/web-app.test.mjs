import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  dedupeWebBoardEntries,
  directIntent,
  issueOwnerToken,
  issuePushRegistrationChallenge,
  normalizeUserName,
  pickupUserRsvpView,
  verifyOwnerCapability,
  normalizeOwnerSettingsInput,
  verifyOwnerToken,
  verifyPushRegistrationChallenge,
  validWebSubscription,
  webCalendarDetails,
  webNextGameDetails,
  webSafeSnapshot,
  withCachedVenue,
} from "../../../../backend/infra/web-worker/worker.mjs";

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

test("pickup RSVP view can use the active user's RSVP identity", () => {
  const snapshot = {
    pickup: { dates: [{ date: "2099-10-08" }] },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          players: [{ name: "Second User" }],
          waitlist: [],
        },
      },
    },
    settings: { ownerRsvpName: "Admin User" },
  };
  assert.deepEqual(pickupUserRsvpView(snapshot, "Second User"), {
    confirmedDates: ["2099-10-08"],
    waitlistedDates: [],
  });
  assert.deepEqual(pickupUserRsvpView(snapshot, "Someone Else"), {
    confirmedDates: [],
    waitlistedDates: [],
  });
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
  }, new Date("2099-10-07T12:00:00-07:00"));

  assert.equal(details.kind, "pickup");
  assert.equal(details.date, "2099-10-08");
  assert.equal(details.title, "Pickup");
  assert.equal(details.location, "Washington Park Soccer");
  assert.equal(details.mapsQuery, "101 Public Field Rd");
  assert.equal(details.rsvpUrl, "https://nhcuong95.github.io/rsvp/?date=2099-10-08");
  assert.equal(details.sourceUpdatedAt, "2099-10-01T12:34:00Z");
  assert.doesNotMatch(JSON.stringify(details), /Private Person|Private Waitlist/);
});


test("RATS history uses raw GitHub reads and a larger encrypted runtime allowance", () => {
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");

  assert.match(worker, /application\/vnd\.github\.raw\+json/);
  assert.match(
    worker,
    /path === "league\/state\/history\.json" \? 10_000_000 : 500_000/,
  );
  assert.match(
    worker,
    /githubRawJsonFile\(env, "league\/state\/history\.json", "runtime-state"\)/,
  );
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
  }, new Date("2099-10-10T13:00:00-07:00"));

  assert.equal(details.kind, "league");
  assert.equal(details.time, "7:30 PM–9:30 PM");
  assert.equal(details.sourceUpdatedAt, "2099-10-01T13:45:00-07:00");
});


test("user capability tokens are revision-bound and user-bound", async () => {
  const env = { TRACKER_STATE_KEY: "test-owner-secret" };
  const issued = await issueOwnerToken(env, 3, "teammate");
  assert.match(issued.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(issued.username, "teammate");
  assert.equal(await verifyOwnerToken(env, issued.token, 3, "teammate"), true);
  assert.equal(await verifyOwnerToken(env, issued.token, 2, "teammate"), false);
  assert.equal(await verifyOwnerToken(env, issued.token, 3, "admin"), false);
  assert.equal(await verifyOwnerToken(env, issued.token + "x", 3, "teammate"), false);
  assert.equal(
    await verifyOwnerToken({ TRACKER_STATE_KEY: "wrong" }, issued.token, 3, "teammate"),
    false,
  );
});

test("usernames normalize predictably and preserve the migrated admin identity", () => {
  assert.equal(normalizeUserName(""), "admin");
  assert.equal(normalizeUserName(" TeamMate "), "teammate");
  assert.equal(normalizeUserName("player.one"), "player.one");
  assert.throws(() => normalizeUserName("bad user name"), /Username must/);
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
  const pickup = calendar.games.find((game) => game.id === "pickup:2099-10-08");
  assert.ok(pickup);
  assert.equal(pickup.rsvpUrl, "https://nhcuong95.github.io/rsvp/?date=2099-10-08");
  assert.equal(pickup.sourceUpdatedAt, "2099-10-01T10:15:00Z");
  assert.equal(pickup.weather.rainProbability, 65);
  assert.equal(pickup.weather.temperatureF, 58);
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
    calendar.games
      .filter((game) => game.kind !== "free_pickup")
      .map((game) => [game.kind, game.date]),
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
  const league = calendar.games.find((game) => game.id === "league:v2:weather-fallback");
  assert.ok(league);
  assert.equal(league.weatherApproximate, true);
  assert.equal(league.weather.rainProbability, 30);
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
  const source = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  assert.match(source, /function retainPrivateText/);
  assert.match(source, /question:\s*retainPrivateText\(event\.question, 4000\)/);
  assert.match(source, /reply:\s*retainPrivateText\(event\.reply, 12000\)/);
  assert.match(source, /const question = retainPrivateText\(body\?\.question, 4000\)/);
  assert.match(source, /const reply = retainPrivateText\(body\?\.reply, 12000\)/);
});


test("web calendar and next-game views honor encrypted match overrides while keeping source IDs", () => {
  const snapshot = {
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
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
          fieldName: "Source Field",
          address: "Source Address",
          players: [],
          waitlist: [],
        },
      },
    },
    league: { teams: [] },
    settings: {
      matchOverrides: {
        "pickup:2099-10-08": {
          id: "pickup:2099-10-08",
          kind: "pickup",
          date: "2099-10-09",
          startTime: "21:00",
          endTime: "23:00",
          location: "Manual Field",
          updatedAt: "2099-10-01T12:00:00Z",
        },
      },
    },
  };

  const calendar = webCalendarDetails(
    snapshot,
    {},
    14,
    "2099-10-01",
    new Date("2099-10-01T12:00:00Z"),
  );
  const overriddenPickup = calendar.games.find((game) => game.id === "pickup:2099-10-08");
  assert.ok(overriddenPickup);
  assert.equal(overriddenPickup.date, "2099-10-09");
  assert.equal(overriddenPickup.location, "Manual Field");
  assert.equal(overriddenPickup.overrideActive, true);
  assert.equal(overriddenPickup.sourceDate, "2099-10-08");
  assert.equal(overriddenPickup.sourceStartTime, "8:00 PM");
  assert.equal(overriddenPickup.sourceLocation, "Source Field");

  const next = webNextGameDetails(snapshot, new Date("2099-10-08T12:00:00-07:00"));
  assert.equal(next.id, "pickup:2099-10-08");
  assert.equal(next.date, "2099-10-09");
  assert.equal(next.startTime, "9:00 PM");
  assert.equal(next.overrideActive, true);
  assert.equal(next.rsvpUrl, "https://nhcuong95.github.io/rsvp/?date=2099-10-08");
});


test("web calendar synthesizes Saturday free pickup through the furthest RSVP or league date", () => {
  const snapshot = {
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
          ok: true,
          reserved: 4,
          capacity: 16,
          startTime: "20:00",
          endTime: "22:00",
        },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-08": {
          fieldName: "RSVP Field",
          address: "Seattle, WA",
          players: [],
          waitlist: [],
        },
      },
    },
    league: {
      teams: [{
        name: "Team Alpha",
        matches: [{
          key: "v2:far",
          date: "2099-10-24",
          startTime: "19:00",
          endTime: "21:00",
          opponent: "Team Beta",
          location: "League Field",
        }],
      }],
    },
    settings: {},
  };

  const calendar = webCalendarDetails(
    snapshot,
    {},
    14,
    "2099-10-01",
    new Date("2099-10-01T12:00:00Z"),
  );
  const free = calendar.games.filter((game) => game.kind === "free_pickup");
  assert.deepEqual(free.map((game) => game.date), [
    "2099-10-03",
    "2099-10-10",
    "2099-10-17",
    "2099-10-24",
  ]);
  assert.ok(free.every((game) => game.time === "10:30 AM–12:30 PM"));
  assert.ok(free.every((game) => game.location === "Jefferson Park Playfield"));
  assert.ok(free.every((game) => game.rsvpUrl === ""));
  assert.equal(free.at(-1).id, "free:2099-10-24");
});

test("Saturday free pickup can become the next game without exposing RSVP state", () => {
  const details = webNextGameDetails({
    pickup: {
      dates: [{ date: "2099-10-20" }],
      events: {
        "2099-10-20": { ok: true, startTime: "20:00", endTime: "22:00" },
      },
    },
    pickupPrivate: {
      events: {
        "2099-10-20": { fieldName: "RSVP Field", address: "Seattle, WA" },
      },
    },
    league: { teams: [] },
    settings: {},
  }, new Date("2099-10-02T12:00:00-07:00"));

  assert.equal(details.kind, "free_pickup");
  assert.equal(details.date, "2099-10-03");
  assert.equal(details.title, "Pickup");
  assert.equal(details.time, "10:30 AM–12:30 PM");
  assert.equal(details.location, "Jefferson Park Playfield");
  assert.equal(details.rsvpUrl, "");
});


test("web calendar omits encrypted soft-deleted pickup, league, and free-pickup matches", () => {
  const snapshot = {
    pickup: {
      dates: [{ date: "2099-10-08" }],
      events: {
        "2099-10-08": {
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
          fieldName: "Pickup Field",
          address: "Seattle, WA",
          players: [],
          waitlist: [],
        },
      },
    },
    league: {
      teams: [{
        name: "Team Alpha",
        matches: [{
          key: "v2:delete-me",
          team: "Team Alpha",
          opponent: "Team Beta",
          date: "2099-10-09",
          startTime: "19:00",
          endTime: "21:00",
          location: "League Field",
        }],
      }],
    },
    settings: {
      hiddenMatches: {
        "pickup:2099-10-08": {
          id: "pickup:2099-10-08",
          label: "Pickup",
          date: "2099-10-08",
          hiddenAt: "2099-10-01T12:00:00Z",
        },
        "league:v2:delete-me": {
          id: "league:v2:delete-me",
          label: "Team Alpha vs Team Beta",
          date: "2099-10-09",
          hiddenAt: "2099-10-01T12:00:00Z",
        },
        "free:2099-10-10": {
          id: "free:2099-10-10",
          label: "Free Pickup",
          date: "2099-10-10",
          hiddenAt: "2099-10-01T12:00:00Z",
        },
      },
    },
  };

  const calendar = webCalendarDetails(
    snapshot,
    {},
    14,
    "2099-10-01",
    new Date("2099-10-01T12:00:00Z"),
  );
  assert.equal(calendar.games.some((game) => game.id === "pickup:2099-10-08"), false);
  assert.equal(calendar.games.some((game) => game.id === "league:v2:delete-me"), false);
  assert.equal(calendar.games.some((game) => game.id === "free:2099-10-10"), false);
});

test("calendar shares verified venue GPS from geocoded weather, never city-wide weather fallback", () => {
  const baseMatch = {
    key: "v2:gps-fixture", date: "2099-10-06", start: "2099-10-06T19:00:00-07:00",
    end: "2099-10-06T21:00:00-07:00", team: "Team Alpha", opponent: "Team Beta",
    location: "Synthetic Soccer Field",
  };
  const snapshot = { pickup: { dates: [], events: {} }, pickupPrivate: { events: {} },
    league: { teams: [{ name: "Team Alpha", matches: [baseMatch] }] } };
  const gps = { latitude: 47.612345, longitude: -122.324567 };
  const weatherState = {
    games: [{ id: "league:v2:gps-fixture", location: "Synthetic Soccer Field",
      address: "", coordinates: gps, weatherApproximate: false }],
  };
  const current = webCalendarDetails(snapshot, weatherState, 14, "2099-10-01");
  assert.deepEqual(current.games.find(game => game.id === "league:v2:gps-fixture").coordinates, gps);

  const fallback = webCalendarDetails(snapshot, {games:[{
    ...weatherState.games[0], weatherApproximate: true,
    coordinates: {latitude:47.6062, longitude:-122.3321},
  }]}, 14, "2099-10-01");
  assert.equal(fallback.games.find(game => game.id === "league:v2:gps-fixture").coordinates, null);

  const changed = structuredClone(snapshot);
  changed.league.teams[0].matches[0].location = "Different Field";
  const stale = webCalendarDetails(changed, weatherState, 14, "2099-10-01");
  assert.equal(stale.games.find(game => game.id === "league:v2:gps-fixture").coordinates, null);
});

test("future league matches reuse cached GPS for the exact venue beyond weather horizon", () => {
  const snapshot = { pickup: { dates: [], events: {} }, pickupPrivate: { events: {} },
    league: {teams:[{name:"Team Alpha", matches:[{
      key:"v2:far-gps", date:"2099-11-20",
      start:"2099-11-20T19:00:00-08:00", end:"2099-11-20T21:00:00-08:00",
      team:"Team Alpha", opponent:"Team Beta", location:"Synthetic Soccer Field"
    }]}]}};
  const cached = {latitude:47.612345,longitude:-122.324567};
  const state = {locations:{"synthetic soccer field, seattle, wa, usa":cached}};
  const calendar = webCalendarDetails(snapshot,state,14,"2099-10-01");
  assert.deepEqual(calendar.games.find(game => game.id === "league:v2:far-gps").coordinates,cached);
  assert.equal(calendar.games.find(game => game.id === "league:v2:far-gps").weatherApproximate,false);
});

test("RATS-published map destination and GPS appear on calendar but not stale overridden field", () => {
  const baseMatch = {
    key: "v2:rats-maps", date: "2099-10-06",
    start: "2099-10-06T19:00:00-07:00", end: "2099-10-06T21:00:00-07:00",
    team: "Team Alpha", opponent: "Team Beta", location: "RATS Field",
    locationUrl: "https://www.google.com/maps/place/RATS+Field/@47.62,-122.33,17z",
    venueCoordinates: { latitude: 47.62, longitude: -122.33 },
  };
  const snapshot = {pickup:{dates:[],events:{}},pickupPrivate:{events:{}},
    league:{teams:[{name:"Team Alpha",matches:[baseMatch]}]}};
  const source = webCalendarDetails(snapshot, {}, 14, "2099-10-01");
  const game = source.games.find(item=>item.id==="league:v2:rats-maps");
  assert.equal(game.locationUrl, baseMatch.locationUrl);
  assert.deepEqual(game.coordinates, baseMatch.venueCoordinates);
  const changed = structuredClone(snapshot);
  changed.settings={matchOverrides:{"league:v2:rats-maps":{
    id:"league:v2:rats-maps",kind:"league",location:"Replacement Field",date:"2099-10-06",
  }}};
  const edited = webCalendarDetails(changed, {}, 14, "2099-10-01");
  const overridden=edited.games.find(item=>item.id==="league:v2:rats-maps");
  assert.equal(overridden.location, "Replacement Field");
  assert.equal(overridden.locationUrl, "");
  assert.equal(overridden.coordinates, null);
});

test("calendar and next-game share immutable RATS venue cache for renamed and misspelled fields", () => {
  const directory = {schemaVersion:1,venues:[
    {name:"Queen Anne Bowl Playfield Soccer",
      url:"https://www.google.com/maps/place/Queen+Anne+Bowl+Playfield",
      coordinates:{latitude:47.6361,longitude:-122.3581}},
    {name:"Delridge South Field 2",
      url:"https://maps.google.com/?q=47.52,-122.36"},
  ]};
  const match = {key:"v2:venue-cache",date:"2099-10-06",
    start:"2099-10-06T19:00:00-07:00",end:"2099-10-06T21:00:00-07:00",
    team:"Team Alpha",opponent:"Team Beta",location:"Queen Ann Bowl Soccer Field"};
  const snapshot={pickup:{dates:[],events:{}},pickupPrivate:{events:{}},
    league:{teams:[{name:"Team Alpha",matches:[match]}]}};
  const calendar=webCalendarDetails(snapshot,{},14,"2099-10-01",new Date("2099-10-01T12:00:00Z"),directory);
  const item=calendar.games.find(x=>x.id==="league:v2:venue-cache");
  assert.equal(item.locationUrl,directory.venues[0].url);
  assert.deepEqual(item.coordinates,directory.venues[0].coordinates);
  assert.equal(withCachedVenue({location:"Queen Ann Bowl Soccer Field"},directory).locationUrl,
    directory.venues[0].url);
  assert.equal(withCachedVenue({location:"Delridge North Field 2"},directory).locationUrl,undefined);
});

test("manually changed field only uses cached link when new field matches, never old source", () => {
  const directory={venues:[{name:"Replacement Field",url:"https://maps.google.com/?q=47.5,-122.3"}]};
  const changed=withCachedVenue({location:"Replacement Field",overrideActive:true,locationUrl:""},directory);
  assert.equal(changed.locationUrl,"https://maps.google.com/?q=47.5,-122.3");
  assert.equal(withCachedVenue({location:"Unknown Field",overrideActive:true,locationUrl:""},directory).locationUrl,"");
});

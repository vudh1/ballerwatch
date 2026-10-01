import test from "node:test";
import assert from "node:assert/strict";
import {
  validWebSubscription,
  webNextGameDetails,
  webSafeSnapshot,
} from "../../../infra/telegram-webhook/worker.mjs";

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

test("web push subscription accepts only HTTPS endpoints", () => {
  const subscription = validWebSubscription({
    endpoint: "https://push.example.test/subscription",
    expirationTime: null,
    keys: { p256dh: "key", auth: "auth" },
  });
  assert.equal(subscription.endpoint, "https://push.example.test/subscription");
  assert.equal(validWebSubscription({ endpoint: "http://example.test" }), null);
  assert.equal(validWebSubscription({ endpoint: "" }), null);
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
    league: {
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
  assert.doesNotMatch(JSON.stringify(details), /Private Person|Private Waitlist/);
});

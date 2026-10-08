import test from "node:test";
import assert from "node:assert/strict";
import {
  createOwnerPasswordRecord,
  dateGameAnswer,
  directIntent,
  gamesInRange,
  gamesOnDate,
  issueFeedbackToken,
  issueOwnerToken,
  nextGame,
  normalizeOwnerPassword,
  pickupRsvpRosterView,
  resolveDate,
  resolveScheduleDate,
  resolveScheduleRange,
  todayGames,
  verifyFeedbackToken,
  verifyOwnerPassword,
  verifyOwnerToken,
} from "../../../../backend/infra/web-worker/worker.mjs";

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

test("dated jersey questions do not require the word game", () => {
  assert.equal(directIntent("what jersey color do i wear for 10/5?"), "date_games");
  assert.equal(directIntent("what jersey colour should I wear Tuesday?"), "date_games");
  assert.match(gamesOnDate(snapshot(), "2099-10-05"), /Black jersey/);
});

test("dated league detail questions route locally and return targeted facts", () => {
  assert.equal(directIntent("who do we play on 10/5?"), "date_games");
  assert.equal(directIntent("where is the game on 10/5?"), "date_games");
  assert.equal(directIntent("what time is the game on 10/5?"), "date_games");
  assert.match(dateGameAnswer(snapshot(), "2099-10-05", "who do we play?"), /Team Beta/);
  assert.match(dateGameAnswer(snapshot(), "2099-10-05", "what jersey color?"), /Black jersey/);
  assert.match(dateGameAnswer(snapshot(), "2099-10-05", "where is it?"), /League Field/);
  assert.match(dateGameAnswer(snapshot(), "2099-10-05", "what time?"), /7:00 PM/);
});

test("RATS record and head-to-head questions route to historical data", () => {
  assert.equal(directIntent("what is the record of Team Alpha?"), "rats_history");
  assert.equal(
    directIntent("has Team Alpha played Team Beta before?"),
    "rats_history",
  );
  assert.equal(
    directIntent("Team Alpha head-to-head with Team Beta"),
    "rats_history",
  );
});

test("natural pickup-specific date questions stay pickup-scoped", () => {
  assert.equal(directIntent("am i in for Thursday pickup?"), "pickup_status");
  assert.equal(directIntent("how many spots are left Thursday?"), "pickup_status");
});

test("private RSVP roster is ordered without exposing private ordering metadata", () => {
  const data = snapshot();
  data.pickupPrivate.events["2099-10-08"].players = [
    { name: "Later Player", participantCount: 2, voteOrder: 9, firstSeenAt: "2099-10-01T12:10:00Z" },
    { name: "First Player", participantCount: 1, voteOrder: 3, firstSeenAt: "2099-10-01T12:00:00Z" },
  ];
  data.pickupPrivate.events["2099-10-08"].waitlist = [
    { name: "Waiting Two", participantCount: 1, voteOrder: 11 },
    { name: "Waiting One", participantCount: 1, voteOrder: 10 },
  ];

  const roster = pickupRsvpRosterView(data, "2099-10-08");
  assert.deepEqual(roster.players, [
    { name: "First Player", participantCount: 1 },
    { name: "Later Player", participantCount: 2 },
  ]);
  assert.deepEqual(roster.waitlist, [
    { name: "Waiting One", participantCount: 1 },
    { name: "Waiting Two", participantCount: 1 },
  ]);
  assert.equal("voteOrder" in roster.players[0], false);
  assert.equal("firstSeenAt" in roster.players[0], false);
});

test("pickup-specific dated detail does not mix in league facts", () => {
  const data = snapshot();
  data.league.teams[0].matches.push({
    team: "Team Alpha",
    opponent: "Team Gamma",
    date: "2099-10-08",
    startTime: "18:00:00",
    location: "League Field Two",
    jerseyColor: "White",
  });

  const reply = dateGameAnswer(data, "2099-10-08", "what time is pickup on 10/8?");
  assert.match(reply, /8:00 PM/);
  assert.doesNotMatch(reply, /6:00 PM|Team Gamma|League Field Two/);
});

test("unpublished weekday still resolves so the answer can say no game", () => {
  const now = new Date("2099-10-04T12:00:00Z");
  assert.equal(
    resolveScheduleDate("do i have a game Tuesday?", snapshot(), {}, now),
    "2099-10-06",
  );
  assert.match(
    dateGameAnswer(snapshot(), "2099-10-06", "do i have a game Tuesday?"),
    /No pickup or RATS game is currently published/,
  );
});

test("mixed week pickup and opponent questions stay range-scoped", () => {
  assert.equal(
    directIntent("who do we play next week and am i in pickup?"),
    "range_games",
  );
  assert.equal(
    directIntent("pickup RSVP and opponent next week"),
    "range_games",
  );
});

test("today pickup answer includes RSVP count context", () => {
  const reply = todayGames(snapshot(), new Date("2099-10-08T12:00:00-07:00"));
  assert.match(reply, /Today's games/);
  assert.match(reply, /14\/16 reserved/);
  assert.match(reply, /Test Field/);
});

test("date schedule reply combines available published data", () => {
  const league = gamesOnDate(snapshot(), "2099-10-05");
  assert.match(league, /Team Alpha vs Team Beta/);
  assert.match(league, /League Field/);

  const pickup = gamesOnDate(snapshot(), "2099-10-08");
  assert.match(pickup, /14\/16 reserved/);
  assert.match(pickup, /Test Field/);
});

test("next game considers league, RSVP pickup, and generated Saturday pickup schedules", () => {
  const result = nextGame(snapshot(), new Date("2099-10-04T12:00:00-07:00"));
  assert.equal(result.date, "2099-10-05");
  assert.match(result.reply, /Team Alpha vs Team Beta/);
});



test("explicit pickup weekday does not fall back to prior conversation date", () => {
  const result = resolveDate(
    "Saturday availability",
    snapshot(),
    { lastDate: "2099-10-08" },
    new Date("2099-10-06T12:00:00Z"),
  );
  assert.equal(result, "2099-10-10");
  assert.notEqual(result, "2099-10-08");
});

test("weekly schedule questions resolve and return all published games in range", () => {
  const now = new Date("2099-10-04T12:00:00Z");
  const range = resolveScheduleRange("what games are next week?", now);
  assert.deepEqual(range, {
    startDate: "2099-10-05",
    endDate: "2099-10-11",
  });
  assert.equal(directIntent("what games are next week?"), "range_games");

  const reply = gamesInRange(snapshot(), range.startDate, range.endDate);
  assert.match(reply, /Team Alpha vs Team Beta/);
  assert.match(reply, /14\/16 reserved/);
  assert.match(reply, /Test Field/);
});

test("feedback authorization is scoped to the exact answer and never grants owner access", async () => {
  const env = { TRACKER_STATE_KEY: "test-feedback-signing-key" };
  const question = "What time is Thursday?";
  const reply = "Thursday pickup starts at 7:15 PM.";

  const token = await issueFeedbackToken(env, question, reply);
  assert.equal(await verifyFeedbackToken(env, token, question, reply), true);
  assert.equal(await verifyFeedbackToken(env, token, question, reply + " changed"), false);
  assert.equal(await verifyOwnerToken(env, token), false);
});

test("user capability tokens remain settings-only after feedback tokens are introduced", async () => {
  const env = { TRACKER_STATE_KEY: "test-owner-signing-key" };
  const issued = await issueOwnerToken(env);
  assert.equal(await verifyOwnerToken(env, issued.token), true);
  assert.equal(
    await verifyFeedbackToken(env, issued.token, "question", "reply"),
    false,
  );
});


test("user password records are server-keyed and verify only the exact password", async () => {
  const env = { TRACKER_STATE_KEY: "test-owner-password-key" };
  const record = await createOwnerPasswordRecord(env, "correct horse battery staple");

  assert.equal(record.v, 2);
  assert.match(record.salt, /^[A-Za-z0-9_-]+$/);
  assert.match(record.digest, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    await verifyOwnerPassword(env, "correct horse battery staple", record),
    true,
  );
  assert.equal(
    await verifyOwnerPassword(env, "correct horse battery staplex", record),
    false,
  );
  assert.equal(
    await verifyOwnerPassword(
      { TRACKER_STATE_KEY: "different-owner-password-key" },
      "correct horse battery staple",
      record,
    ),
    false,
  );
});

test("user password validation enforces a meaningful minimum without trimming secrets", () => {
  assert.equal(normalizeOwnerPassword("  twelve chars  "), "  twelve chars  ");
  assert.throws(() => normalizeOwnerPassword("short"), /between 12 and 200/);
  assert.throws(() => normalizeOwnerPassword("x".repeat(201)), /between 12 and 200/);
});

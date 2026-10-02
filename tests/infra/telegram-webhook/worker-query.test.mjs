import test from "node:test";
import assert from "node:assert/strict";
import {
  createOwnerPasswordRecord,
  gamesOnDate,
  issueFeedbackToken,
  issueOwnerToken,
  nextGame,
  normalizeOwnerPassword,
  resolveScheduleDate,
  verifyFeedbackToken,
  verifyOwnerPassword,
  verifyOwnerToken,
} from "../../../infra/telegram-webhook/worker.mjs";

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

import assert from "node:assert/strict";
import test from "node:test";
import { pickupNotificationAudience } from "../../../backend/shared/notification-audience.mjs";

const settings = {
  ownerRsvpName: "Alex Green",
  webUsers: { teammate: { rsvpName: "Robin Blue" } },
};
const roster = {
  "2026-10-15": {
    players: [{ name: " Alex   Green " }],
    waitlist: [{ name: "Robin Blue" }],
  },
};
const confirmed = { userId: "admin" };
const waitlisted = { userId: "teammate" };
const anonymous = { userId: "" };
const rsvp = { tag: "pickup-rsvp-reminder-2026-10-15" };
const capacity = { tag: "pickup-capacity-2026-10-15-16" };
const kickoff = { tag: "pickup-start-reminder-2026-10-15" };

test("confirmed signups receive no duplicate RSVP or capacity nudge", () => {
  assert.equal(pickupNotificationAudience(rsvp, confirmed, settings, roster), false);
  assert.equal(pickupNotificationAudience(capacity, confirmed, settings, roster), false);
  assert.equal(pickupNotificationAudience(kickoff, confirmed, settings, roster), true);
});
test("waitlisted users are not asked to sign up twice, but can get capacity alerts", () => {
  assert.equal(pickupNotificationAudience(rsvp, waitlisted, settings, roster), false);
  assert.equal(pickupNotificationAudience(capacity, waitlisted, settings, roster), true);
});
test("anonymous, no configured RSVP name, and missing roster fail open", () => {
  assert.equal(pickupNotificationAudience(rsvp, anonymous, settings, roster), true);
  assert.equal(pickupNotificationAudience(rsvp, {userId: "unknown"}, settings, roster), true);
  assert.equal(pickupNotificationAudience(rsvp, confirmed, settings, {}), true);
});

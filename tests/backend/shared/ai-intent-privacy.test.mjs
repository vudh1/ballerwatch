import test from "node:test";
import assert from "node:assert/strict";
import {
  safeForExternalIntent,
  validatedAiIntent,
} from "../../../backend/shared/ai-intent-privacy.mjs";

test("only nonpersonal public schedule queries may reach an optional AI classifier", () => {
  for (const text of [
    "Which soccer fixture is on Saturday?",
    "Who plays PhoSaiGon next week?",
    "Where does the league team play?",
  ]) assert.equal(safeForExternalIntent(text), true, text);
  for (const text of [
    "Am I on the waitlist for Thursday?",
    "Is my RSVP confirmed?",
    "My account password is secret",
    "Email me at person@example.com",
    "What's at https://example.com",
    "Call 206-555-1212 about the match",
    "Please add a team to my account",
    "x".repeat(181),
  ]) assert.equal(safeForExternalIntent(text), false, text);
});

test("model outputs are always intent allowlisted and public dates must exist", () => {
  const dates=["2099-10-09","2099-10-16"];
  assert.deepEqual(validatedAiIntent({intent:"date_games",date:"2099-10-09"},dates),
    {intent:"date_games",date:"2099-10-09"});
  assert.equal(validatedAiIntent({intent:"date_games",date:"2099-10-11"},dates),null);
  assert.equal(validatedAiIntent({intent:"promote_release"},dates),null);
  assert.equal(validatedAiIntent({intent:"github"},dates),null);
  assert.equal(validatedAiIntent({intent:"date_games",date:"tomorrow"},dates),null);
  assert.equal(validatedAiIntent({intent:"pickup_status",date:"../secret"},dates),null);
});

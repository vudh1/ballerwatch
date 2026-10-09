import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  feedbackQuestionShape,
  negativeFeedbackProjection,
} from "../../../backend/shared/feedback-review.mjs";

test("RATS history feedback distinguishes record and head-to-head failures safely", () => {
  assert.equal(
    feedbackQuestionShape("what is the all-time record for Team Alpha?"),
    "historical record",
  );
  assert.equal(
    feedbackQuestionShape("has Team Alpha played Team Beta before?"),
    "head-to-head",
  );

  const projection = negativeFeedbackProjection({
    intent: "rats_history",
    question: "what is the record of Private Team Name?",
  });
  assert.equal(projection.kind, "negative_feedback");
  assert.match(projection.summary, /RATS-history/);
  assert.match(projection.summary, /historical record/);
  assert.match(projection.reason, /archive coverage, score parsing, season discovery, and team matching/);
  assert.doesNotMatch(JSON.stringify(projection), /Private Team Name/);
});

test("safe review groups failures by intent and runs on a regular cadence", () => {
  const script = fs.readFileSync("scripts/review-feedback.mjs", "utf8");
  const workflow = fs.readFileSync(".github/workflows/review-feedback.yml", "utf8");

  assert.match(script, /reviewByIntent/);
  assert.match(script, /intent:\s*String\(signal\?\.intent/);
  assert.match(workflow, /schedule:[\s\S]*cron:\s*"17 \*\/6 \* \* \*"/);
});


test("AI 8.1 feedback review identifies fixture and briefing failures without names", () => {
  const fixture = negativeFeedbackProjection({
    intent:"league_fixture",
    question:"The fixture venue for Private Club is wrong",
  });
  const briefing = negativeFeedbackProjection({
    intent:"briefing",
    question:"Weekly briefing for Private Club had a missing result",
  });
  assert.match(fixture.summary,/league fixture/);
  assert.match(briefing.summary,/weekly briefing/);
  assert.doesNotMatch(JSON.stringify([fixture,briefing]),/Private Club/);
});

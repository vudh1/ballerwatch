import test from "node:test";
import assert from "node:assert/strict";

import {
  feedbackQuestionShape,
  negativeFeedbackProjection,
} from "../../../backend/shared/feedback-review.mjs";

test("RATS answer reviews distinguish record and head-to-head questions", () => {
  assert.match(
    feedbackQuestionShape("What is Team Alpha's record?"),
    /team record/,
  );
  assert.match(
    feedbackQuestionShape("Has Team Alpha played Team Beta before?"),
    /head-to-head/,
  );
});

test("RATS answer reviews classify team matching without copying team names", () => {
  const review = negativeFeedbackProjection({
    intent: "rats_history",
    question: "What is Team Alpha's record?",
    reply: "I couldn't match a RATS team name exactly. Possible teams: Team Alpha.",
  });

  assert.equal(review.kind, "negative_feedback");
  assert.match(review.summary, /RATS-history/);
  assert.match(review.summary, /team record/);
  assert.match(review.summary, /team-name matching failure/);
  assert.doesNotMatch(JSON.stringify(review), /Team Alpha/);
});

test("RATS answer reviews classify missing scored-result coverage", () => {
  const review = negativeFeedbackProjection({
    intent: "rats_history",
    question: "What is the record?",
    reply: "I found the team in the RATS history index, but no completed scored matches.",
  });

  assert.match(review.summary, /missing scored-result coverage/);
  assert.doesNotMatch(JSON.stringify(review), /Team Alpha|3-1|2026-10-01/);
});

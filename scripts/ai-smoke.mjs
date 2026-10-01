/**
 * v2.5.0 notification-silent live provider wiring check with synthetic public facts.
 * Does not load chats/state or import Telegram/Calendar clients; prints only provider status.
 */
import assert from "node:assert/strict";
import { answerUnknownWithAi } from "../shared/ai-fallback.mjs";

assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY must be wired into the smoke workflow");
const result = await answerUnknownWithAi(
  "What color is the fictional practice ball?",
  "The fictional practice ball is blue.",
);
assert.equal(result.decision?.action, "answer", "No safe AI provider answer was available");
assert.match(result.decision.reply, /blue/i, "Answer must use the synthetic fact");
console.log(`Notification-silent AI smoke passed via ${result.provider}.`);

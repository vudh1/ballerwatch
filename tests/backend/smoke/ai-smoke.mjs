/**
 * v2.5.0 notification-silent live provider wiring check with synthetic public facts.
 * Does not load chats/state or import notification/Calendar clients; prints only provider status.
 */
import assert from "node:assert/strict";
import { requestAiJson } from "../../../backend/shared/ai-provider.mjs";
import { answerUnknownWithAi } from "../../../backend/shared/ai-fallback.mjs";

assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY must be wired into the smoke workflow");
const probe = await requestAiJson("gemini", process.env, {
  system: 'Return JSON only: {"color":"blue"}.',
  user: "The fictional practice ball is blue. What color is it?",
  tokens: 120,
  timeoutMs: 2500,
  onFailure: reason => console.log(`Gemini availability: ${reason}`),
});
console.log(`Gemini direct synthetic probe: ${probe?.color === "blue" ? "passed" : "unavailable"}.`);
const result = await answerUnknownWithAi(
  "What color is the fictional practice ball?",
  "The fictional practice ball is blue.",
);
assert.equal(result.decision?.action, "answer", "No safe AI provider answer was available");
assert.match(result.decision.reply, /blue/i, "Answer must use the synthetic fact");
console.log(`Notification-silent AI smoke passed via ${result.provider}.`);

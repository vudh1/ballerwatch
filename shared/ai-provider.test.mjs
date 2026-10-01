import test from "node:test";
import assert from "node:assert/strict";
import { aiProviders, requestAiJson } from "./ai-provider.mjs";
import { answerUnknownWithAi, DAILY_AI_LIMIT } from "./ai-fallback.mjs";
import { classifyWithAi, directIntent } from "../infra/telegram-webhook/worker.mjs";

const gemini = value => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }));
const groq = value => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
const answer = { action: "answer", reply: "Eight spots remain." };

function setup(t, responses) {
  const oldEnv = process.env;
  process.env = { ...oldEnv, GEMINI_API_KEY: "test-gemini", GROQ_API_KEY: "test-groq" };
  t.after(() => { process.env = oldEnv; });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok(/generativelanguage.googleapis.com|api.groq.com/.test(url), "Tests must never contact Telegram or state APIs");
    calls.push({ url, options, body: JSON.parse(options.body) });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response, "Unexpected extra provider call");
    return response;
  });
  return calls;
}

test("Gemini answers first using header authentication, bounded JSON and no tools", async t => {
  const calls = setup(t, [gemini(answer)]);
  const result = await answerUnknownWithAi("Is there room?", "Eight spots remain.");
  assert.equal(result.provider, "gemini");
  assert.equal(result.settings.aiUsageCount, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers["x-goog-api-key"], "test-gemini");
  assert.ok(!calls[0].url.includes("test-gemini"));
  assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.equal(calls[0].body.tools, undefined);
});

for (const [name, response] of [
  ["rate limit", () => new Response("", { status: 429 })],
  ["outage", () => new Response("", { status: 503 })],
  ["network failure", () => new Error("network")],
  ["malformed JSON", () => gemini(null)],
  ["cannot answer", () => gemini({ action: "cannot_answer" })],
  ["legacy refusal", () => gemini({ action: "feature_request" })],
  ["unsafe claim", () => gemini({ action: "answer", reply: "I updated your Calendar." })],
  ["blocked", () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))],
  ["truncated", () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }))],
]) {
  test(`Gemini ${name} falls through to Groq`, async t => {
    const calls = setup(t, [response(), groq(answer)]);
    const result = await answerUnknownWithAi("Is there room?", "Eight spots remain.");
    assert.equal(result.provider, "groq");
    assert.equal(result.settings.aiUsageCount, 2);
    assert.equal(calls.length, 2);
  });
}

test("missing Gemini key preserves Groq path; no keys skips AI", async t => {
  setup(t, [groq(answer)]);
  delete process.env.GEMINI_API_KEY;
  assert.equal((await answerUnknownWithAi("Is there room?", "Eight spots remain.")).provider, "groq");
  delete process.env.GROQ_API_KEY;
  assert.equal((await answerUnknownWithAi("Is there room?", "")).reason, "ai_not_configured");
  assert.deepEqual(aiProviders({}), []);
});

test("both providers failing returns control to deterministic fallback", async t => {
  setup(t, [gemini({ action: "cannot_answer" }), groq({ action: "feature_request" })]);
  assert.equal((await answerUnknownWithAi("Is there room?", "")).decision, null);
});

test("actions bypass AI and exhausted budgets prevent calls", async t => {
  const calls = setup(t, []);
  for (const question of ["Send a message", "Book a field", "Update Calendar", "RSVP for me"]) {
    assert.equal((await answerUnknownWithAi(question, "")).reason, "deterministic_action_required");
  }
  const settings = { aiUsageDate: new Date().toISOString().slice(0, 10), aiUsageCount: DAILY_AI_LIMIT };
  assert.equal((await answerUnknownWithAi("Is there room?", "", settings)).reason, "daily_limit_reached");
  assert.equal(calls.length, 0);
});

test("fallback attempt cannot exceed remaining daily budget", async t => {
  const calls = setup(t, [gemini({ action: "cannot_answer" })]);
  const settings = { aiUsageDate: new Date().toISOString().slice(0, 10), aiUsageCount: DAILY_AI_LIMIT - 1 };
  assert.equal((await answerUnknownWithAi("Is there room?", "", settings)).decision, null);
  assert.equal(calls.length, 1);
});

test("timeout aborts a provider request", async t => {
  t.mock.method(globalThis, "fetch", async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  assert.equal(await requestAiJson("gemini", { GEMINI_API_KEY: "test" }, { system: "", user: "", tokens: 10, timeoutMs: 5 }), null);
});

test("Worker uses Gemini then Groq for allowlisted intent only, without KV", async t => {
  const calls = setup(t, [gemini({ intent: "github" }), groq({ intent: "next_game" })]);
  const cache = new Map();
  const oldCaches = globalThis.caches;
  t.after(() => { globalThis.caches = oldCaches; });
  globalThis.caches = { default: {
    match: async key => cache.get(key.url)?.clone(),
    put: async (key, value) => cache.set(key.url, value.clone()),
  } };
  assert.deepEqual(await classifyWithAi(process.env, "Upcoming fixture?", { teams: [] }, {}), { intent: "next_game", date: "" });
  assert.equal(calls.length, 2);
});

test("common questions resolve deterministically without any network", t => {
  const calls = setup(t, []);
  for (const text of ["/version", "help", "what field?", "how many spots left?", "next game"]) {
    assert.ok(directIntent(text));
  }
  assert.equal(calls.length, 0);
});

test("neither provider may claim completed actions", async t => {
  setup(t, [gemini({ action: "answer", reply: "Done, I took care of it." }), groq({ action: "answer", reply: "Your request is completed." })]);
  assert.equal((await answerUnknownWithAi("Please take care of it", "")).decision, null);
});

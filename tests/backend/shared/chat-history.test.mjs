import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { recordChatExchange } from "../../shared/chat-history.mjs";
import { decryptState } from "../../shared/state-crypto.mjs";

test("chat history and sanitized review projection are both encrypted at rest", async (t) => {
  const cwd = process.cwd();
  const oldKey = process.env.TRACKER_STATE_KEY;
  const oldGroq = process.env.GROQ_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-chat-history-"));
  process.chdir(dir);
  process.env.TRACKER_STATE_KEY = "synthetic-chat-history-key";
  delete process.env.GROQ_API_KEY;

  t.after(() => {
    process.chdir(cwd);
    if (oldKey == null) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = oldKey;
    if (oldGroq == null) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = oldGroq;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const question = "What time\nis Thursday pickup?";
  const reply = "8:30 PM–10:30 PM\nWashington Park Soccer";

  await recordChatExchange({
    question,
    reply,
    hint: "negative_feedback",
    source: "web-pwa-feedback",
    externalId: "web-feedback:test-1234",
  });

  const encryptedText = fs.readFileSync("state/chat-history.json", "utf8");
  assert.doesNotMatch(encryptedText, /Thursday pickup|Washington Park Soccer/);

  const decrypted = decryptState(JSON.parse(encryptedText));
  assert.equal(decrypted.entries.length, 1);
  assert.equal(decrypted.entries[0].question, question);
  assert.equal(decrypted.entries[0].reply, reply);
  assert.equal(decrypted.entries[0].kind, "negative_feedback");

  const reviewText = fs.readFileSync("state/chat-review.json", "utf8");
  assert.doesNotMatch(
    reviewText,
    /Thursday pickup|Washington Park Soccer|negative_feedback|signals/,
  );
  const review = decryptState(JSON.parse(reviewText));
  assert.equal(review.signals.length, 1);
  assert.equal(review.signals[0].kind, "negative_feedback");
});

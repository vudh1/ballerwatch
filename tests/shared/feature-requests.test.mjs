import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { decryptState } from "../../shared/state-crypto.mjs";
import { recordUnknownQuestion, refreshPublicRequests, isPublicRequestSummary, publicRequestSummary } from "../../shared/feature-requests.mjs";

test("private request text never enters the public projection", () => {
  const summary = publicRequestSummary([
    { question: "Contact Example Person audit@example.invalid 202-555-0142 at 123 Example Street", count: 2, id: "private-id", firstSeenAt: "private-time", extra: "private" },
    { question: "game at https://example.invalid/private?token=secret on 2026-10-01", count: 3 },
  ]);
  assert.deepEqual(summary, { version: 3, requests: [
    { category: "schedule", count: 3, manual: 0, thumbsDown: 0 },
    { category: "other", count: 2, manual: 0, thumbsDown: 0 },
  ] });
  assert.equal(isPublicRequestSummary(summary), true);
});

test("audit rejects free text, metadata, arbitrary categories and malformed counts", () => {
  const good = { version: 3, requests: [{ category: "other", count: 1, manual: 0, thumbsDown: 0 }] };
  for (const bad of [
    { ...good, timestamp: "private" },
    { version: 1, requests: [] },
    { version: 3, requests: [{ category: "other", count: 1, manual: 0, thumbsDown: 0, question: "private" }] },
    { version: 3, requests: [{ category: "private@example.invalid", count: 1, manual: 0, thumbsDown: 0 }] },
    { version: 3, requests: [{ category: "other", count: "private", manual: 0, thumbsDown: 0 }] },
    { version: 3, requests: [{ category: "other", count: -1, manual: 0, thumbsDown: 0 }] },
    { version: 2, requests: [...good.requests, ...good.requests] },
  ]) assert.equal(isPublicRequestSummary(bad), false);
});

test("encrypted persistence preserves originals, deduplicates, migrates public data and fails closed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-privacy-"));
  const previous = process.env.TRACKER_STATE_KEY;
  process.env.TRACKER_STATE_KEY = crypto.randomBytes(32).toString("hex");
  try {
    const question = "Please contact Example Person at audit@example.invalid 202-555-0142";
    const id = recordUnknownQuestion(question, directory);
    assert.equal(recordUnknownQuestion(question, directory), id);
    const encrypted = fs.readFileSync(path.join(directory, "private.json"), "utf8");
    assert.equal(encrypted.includes("audit@example.invalid"), false);
    const privateData = decryptState(JSON.parse(encrypted));
    assert.equal(privateData.requests[0].question, question);
    assert.equal(privateData.requests[0].count, 2);
    fs.writeFileSync(path.join(directory, "unknown.json"), JSON.stringify({ version: 1, requests: [{ question }] }));
    refreshPublicRequests(directory);
    const publicText = fs.readFileSync(path.join(directory, "unknown.json"), "utf8");
    assert.doesNotMatch(publicText, /other|requests|audit@example\.invalid/);
    assert.deepEqual(decryptState(JSON.parse(publicText)), {
      version: 3,
      requests: [{ category: "other", count: 2, manual: 0, thumbsDown: 0 }],
    });
    process.env.TRACKER_STATE_KEY = "wrong-test-key";
    assert.throws(() => recordUnknownQuestion("another request", directory), /Unable to decrypt/);
    assert.throws(() => refreshPublicRequests(directory), /Unable to decrypt/);
    assert.equal(fs.readFileSync(path.join(directory, "private.json"), "utf8"), encrypted);
    assert.equal(fs.readFileSync(path.join(directory, "unknown.json"), "utf8"), publicText);
  } finally {
    if (previous === undefined) delete process.env.TRACKER_STATE_KEY;
    else process.env.TRACKER_STATE_KEY = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

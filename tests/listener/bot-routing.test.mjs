import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createWebPairCode,
  normalizeWebPairCode,
} from "../../listener/bot.mjs";

test("weekday time questions use deterministic pickup details before AI fallback", () => {
  const source = fs.readFileSync("listener/bot.mjs", "utf8");

  assert.match(source, /function isDateMatchDetailIntent/);
  assert.match(source, /return hasExplicitDateReference\(text\) &&/);
  assert.match(source, /time\|when\|where\|field\|location\|address/);
  assert.match(
    source,
    /if \(isDateMatchDetailIntent\(clean\)\) \{[\s\S]*eventForDate\(date\)[\s\S]*statusReply\(date, event, settings\)/,
  );
  assert.match(
    source,
    /if \(scheduleDate\) \{[\s\S]*gamesForDateReply\(scheduleDate, settings\)/,
  );
});


test("web pairing codes are high-entropy, human-readable, and single-use", () => {
  const codes = new Set();
  for (let index = 0; index < 64; index += 1) {
    const code = createWebPairCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{12}$/);
    codes.add(code);
  }
  assert.ok(codes.size > 60);
  assert.equal(normalizeWebPairCode("ABCD-EFGH-JK23"), "ABCDEFGHJK23");

  const source = fs.readFileSync("listener/bot.mjs", "utf8");
  assert.match(source, /Single use\. Expires in 10 minutes\./);
  assert.match(source, /delete next\.webPairCodeHash/);
  assert.match(source, /delete next\.webPairExpiresAt/);
});

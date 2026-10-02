import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("pickup notifications require a meaningful state change", () => {
  const source = fs.readFileSync("pickup/notify.mjs", "utf8");

  assert.doesNotMatch(source, /HEARTBEAT_MS/);
  assert.doesNotMatch(source, /URGENT_REMINDER_MS/);
  assert.doesNotMatch(source, /hourly reminder/);
  assert.doesNotMatch(source, /urgent 15-minute reminder/);
  assert.match(
    source,
    /if \(!changed && !ownerStatusChanged\) \{[\s\S]*duplicate notification suppressed/,
  );
});

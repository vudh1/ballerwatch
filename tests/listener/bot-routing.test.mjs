import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

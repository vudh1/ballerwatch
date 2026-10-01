import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, digest, zonedIso } from "../../league/rats-utils.mjs";

test("canonical digest matches legacy Python json.dumps hashing", () => {
  const sample = {b: 2, a: "é", arr: [true, null, "😀"]};
  assert.equal(
    canonicalJson(sample),
    '{"a":"\\u00e9","arr":[true,null,"\\ud83d\\ude00"],"b":2}',
  );
  assert.equal(
    digest(sample),
    "0dad7d03af2ea91dfbbaa991a366b97087ce61045c388a3529022e2ad1621a9f",
  );
});

test("Pacific local times keep the correct DST offset", () => {
  assert.equal(zonedIso("2026-10-05", "19:15:00"), "2026-10-05T19:15:00-07:00");
  assert.equal(zonedIso("2026-11-02", "19:15:00"), "2026-11-02T19:15:00-08:00");
});

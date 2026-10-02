import test from "node:test";
import assert from "node:assert/strict";
import { cleanName, fingerprint } from "../../../infra/web-worker/edge-runtime.mjs";

test("cleanName normalizes whitespace without changing words", () => {
  assert.equal(cleanName("  Third   Touch FC  "), "Third Touch FC");
});

test("fingerprint is stable across object key order", async () => {
  const a=await fingerprint({b:2,a:1,nested:{z:3,y:2}});
  const b=await fingerprint({nested:{y:2,z:3},a:1,b:2});
  assert.equal(a,b);
});

test("fingerprint changes when source data changes", async () => {
  const a=await fingerprint({reserved:14,capacity:16});
  const b=await fingerprint({reserved:15,capacity:16});
  assert.notEqual(a,b);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createBoundedLoadCache } from "../../../backend/shared/bounded-load-cache.mjs";

test("repeated and simultaneous scouting reads reuse the same archive identity", async () => {
  let clock = 1000, requests = 0;
  const cache = createBoundedLoadCache({ now: () => clock });
  const load = async () => {
    requests += 1;
    return { seasons: [], revision: requests };
  };
  const [a,b,c] = await Promise.all([
    cache.get("history", 120000, load),
    cache.get("history", 120000, load),
    cache.get("history", 120000, load),
  ]);
  assert.equal(requests, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  clock += 119999;
  assert.equal(await cache.get("history", 120000, load), a);
  clock += 2;
  const newArchive = await cache.get("history", 120000, load);
  assert.notEqual(newArchive, a);
  assert.equal(requests, 2);
});

test("only explicitly transient failures reuse last good public snapshots", async () => {
  let clock = 100;
  const cache = createBoundedLoadCache({ now: () => clock });
  const old = { games: [{ id: "known-public-fixture" }] };
  assert.equal(await cache.get("snapshot", 2000, async () => old), old);
  clock += 3000;
  const fallback = await cache.get("snapshot", 2000, async () => {
    throw new Error("GitHub fetch HTTP 503");
  }, { staleMs: 10000, transientError: (e) => /503/.test(e.message) });
  assert.equal(fallback, old);
  clock += 6000;
  await assert.rejects(cache.get("snapshot", 2000, async () => {
    throw new Error("Canonical runtime state is missing");
  }, { staleMs: 10000, transientError: (e) => /503/.test(e.message) }), /missing/);
  // Even when the prior cached value is recent, intentional deletion
  // (404) may not resurrect the old canonical runtime snapshot.
  await assert.rejects(cache.get("snapshot", 2000, async () => {
    throw new Error("GitHub state fetch HTTP 404");
  }, { staleMs: 10000, transientError: (e) => /503/.test(e.message) }), /404/);
  clock += 15000;
  await assert.rejects(cache.get("snapshot", 2000, async () => {
    throw new Error("GitHub fetch HTTP 503");
  }, { staleMs: 10000, transientError: (e) => /503/.test(e.message) }), /503/);
});

test("a failed initial archive read does not poison later requests", async () => {
  const cache = createBoundedLoadCache({ maxEntries: 2 });
  await assert.rejects(cache.get("a", 3000, async () => {
    throw new Error("temporary error");
  }), /temporary/);
  assert.equal(cache.size, 0);
  assert.deepEqual(await cache.get("a", 3000, async () => ({ ok: true })), { ok: true });
  await cache.get("b", 3000, async () => 2);
  await cache.get("c", 3000, async () => 3);
  assert.equal(cache.size, 2);
});

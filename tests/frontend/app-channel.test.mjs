import test from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_PREFERENCE_KEY, activeChannel, channelUrl, savedChannel, switchChannel,
} from "../../frontend/web/lib/app-channel.js";

const store = (initial = {}) => ({
  values: { ...initial },
  getItem(key) { return this.values[key] ?? null; },
  setItem(key, value) { this.values[key] = value; },
});

function location(pathname) {
  return { pathname, origin: "https://example.com", navigated: [],
    assign(url) { this.navigated.push(url); } };
}

test("production is the default for missing and invalid device preferences", () => {
  assert.equal(savedChannel(store()), "production");
  assert.equal(savedChannel(store({[CHANNEL_PREFERENCE_KEY]: "invalid"})), "production");
  assert.equal(savedChannel({getItem() { throw new Error("private browsing"); }}), "production");
  assert.equal(activeChannel("/ballerwatch/"), "production");
  assert.equal(activeChannel("/ballerwatch/beta/"), "beta");
  assert.equal(channelUrl("beta", "https://example.com"), "https://example.com/ballerwatch/beta/");
});

test("production-to-beta switches only after a successful availability check", async () => {
  const storage = store(), loc = location("/ballerwatch/");
  const visited = [];
  const result = await switchChannel("beta", {location:loc, storage,
    check:async (url)=>{visited.push(url);return {ok:true};}});
  assert.equal(result.navigated, true);
  assert.equal(storage.values[CHANNEL_PREFERENCE_KEY], "beta");
  assert.deepEqual(loc.navigated, ["https://example.com/ballerwatch/beta/"]);
  assert.deepEqual(visited, loc.navigated);
});

test("beta-to-production navigates without depending on beta", async () => {
  const storage = store({[CHANNEL_PREFERENCE_KEY]:"beta"}), loc = location("/ballerwatch/beta/");
  const result = await switchChannel("production", {location:loc, storage,
    check:()=>{throw new Error("Should not check production HEAD");}});
  assert.equal(result.navigated, true);
  assert.equal(savedChannel(storage), "production");
  assert.deepEqual(loc.navigated, ["https://example.com/ballerwatch/"]);
});

test("unavailable beta fails safely on production without a redirect loop", async () => {
  const storage = store({[CHANNEL_PREFERENCE_KEY]:"beta"}), loc = location("/ballerwatch/");
  const result = await switchChannel("beta", {location:loc,storage,
    check:async()=>({ok:false})});
  assert.equal(result.unavailable, true);
  assert.equal(result.navigated, false);
  assert.equal(savedChannel(storage), "production");
  assert.equal(loc.navigated.length, 0);
  await switchChannel("production", {location:loc,storage});
  assert.equal(loc.navigated.length, 0);
});

test("channel routing never forwards private query strings or hash fragments", () => {
  assert.equal(channelUrl("production", "https://example.com"), "https://example.com/ballerwatch/");
  assert.equal(channelUrl("unknown", "https://example.com"), "https://example.com/ballerwatch/");
});

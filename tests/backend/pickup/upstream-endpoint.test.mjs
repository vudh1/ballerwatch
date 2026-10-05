import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverPublicRsvpEndpoint,
  extractPublicRsvpEndpoint,
  shouldRediscoverEndpoint,
} from "../../pickup/upstream-endpoint.mjs";

test("extracts only the normal public Apps Script endpoint", () => {
  const source = [
    'const APPS_SCRIPT_URL = "https://script.google.com/macros/s/public-deployment/exec";',
    'const ADMIN_APPS_SCRIPT_URL = "https://script.google.com/macros/s/admin-deployment/exec";',
  ].join("\n");
  assert.equal(
    extractPublicRsvpEndpoint(source),
    "https://script.google.com/macros/s/public-deployment/exec",
  );
});

test("rejects invalid or non-Apps-Script endpoints", () => {
  assert.equal(extractPublicRsvpEndpoint('const APPS_SCRIPT_URL = "http://example.com/exec";'), "");
  assert.equal(extractPublicRsvpEndpoint('const APPS_SCRIPT_URL = "https://example.com/exec";'), "");
  assert.equal(extractPublicRsvpEndpoint("const OTHER_URL = 'https://script.google.com/x/exec';"), "");
});

test("discovery uses frontend source without exposing endpoint elsewhere", async () => {
  const endpoint = await discoverPublicRsvpEndpoint({
    fetchImpl: async () => ({
      ok: true,
      text: async () => 'const APPS_SCRIPT_URL = "https://script.google.com/macros/s/recovered/exec";',
    }),
    sourceUrl: "https://example.invalid/app.js",
  });
  assert.equal(endpoint, "https://script.google.com/macros/s/recovered/exec");
});

test("only retired endpoint statuses trigger rediscovery", () => {
  assert.equal(shouldRediscoverEndpoint({ status: 404 }), true);
  assert.equal(shouldRediscoverEndpoint({ status: 410 }), true);
  assert.equal(shouldRediscoverEndpoint({ status: 429 }), false);
  assert.equal(shouldRediscoverEndpoint({ status: 503 }), false);
});

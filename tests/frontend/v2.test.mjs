import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { SCENE, scenePose, featureStory, cameraFlash } from "../../frontend/web/v2/scene-config.mjs";

const read = (name) => fs.readFileSync(`frontend/web/${name}`, "utf8");

test("ball contact, curved flight, goalkeeper and upper-corner impact stay synchronized", () => {
  const contact = scenePose(SCENE.contact);
  assert.equal(contact.kick, 0);
  assert.deepEqual({ x: contact.ball.x, y: contact.ball.y }, SCENE.ball.start);
  assert.equal(contact.dive, 0);
  const middle = scenePose((SCENE.contact + SCENE.flightEnd) / 2);
  assert.ok(middle.ball.x > SCENE.ball.start.x);
  assert.ok(middle.ball.y < (SCENE.ball.start.y + SCENE.ball.corner.y) / 2);
  assert.ok(middle.ball.scale < contact.ball.scale);
  assert.ok(middle.ball.rotation > 0);
  assert.equal(scenePose(SCENE.diveStart).dive, 0);
  assert.equal(scenePose(SCENE.diveEnd).dive, 1);
  const goal = scenePose(SCENE.flightEnd);
  assert.deepEqual({ x: goal.ball.x, y: goal.ball.y }, SCENE.ball.corner);
  assert.ok(scenePose(0.87).netPulse > 0);
  assert.equal(scenePose(0.92).reveal, 0);
  assert.equal(scenePose(1).reveal, 1);
});

test("V2 separates a brief launch and scroll hero from unchanged V1 cards", () => {
  const timeline = read("v2/timeline.js");
  const css = read("v2/styles.css");
  const html = read("index.html");
  const v1 = fs.readFileSync("tests/frontend/fixtures/v1-8.14.1.html", "utf8");
  assert.equal(SCENE.launchMs, 2000);
  assert.match(timeline, /intro.offsetHeight - height/);
  assert.match(timeline, /revealApp\(pose.reveal >= 0.1\)/);
  assert.match(css, /\.soccer-stage \{[^}]*position: sticky/);
  assert.doesNotMatch(css, /\.v2 \.(?:card|next-game-card|calendar-card|standings-slide)\s*\{/);
  assert.doesNotMatch(html, /v2-sidebar|v2-editorial|v2-shortcuts|v2-bottom-nav|V2 experience/);
  assert.doesNotMatch(html, /hero-actions v2-quick-actions/);
  assert.equal((html.match(/class="app-hub-tabs"/g) || []).length, 3);
  assert.doesNotMatch(html, /id="skip-launch"|Skip to matches/);
  assert.doesNotMatch(timeline, /#skip-launch/);
  assert.doesNotMatch(css, /#skip-launch/);
  assert.equal((html.match(/class="app-hub-header"/g) || []).length, 3);
  for (const id of ["close-chat", "close-notifications", "close-settings"]) {
    assert.match(html, new RegExp(`class="icon-button app-hub-close" id="${id}"`));
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
  }
  assert.match(html, /id="scene-captain-band"/);
  assert.match(html, /id="scene-player-number"[^>]*>10<\/text>/);
  assert.doesNotMatch(html, /M6-70h14l-11 28/);
  const cardFeed = (source, end) => source.slice(source.indexOf('    <div class="spotlight-carousel"'), source.indexOf(end));
  assert.equal(cardFeed(html, '    <footer>'), cardFeed(v1, '    <footer>'));
  assert.match(read("v2/prepaint.js"), /ballerwatch:v2:intro-seen/);
  assert.match(read("v2/prepaint.js"), /ballerwatch:v2:launch-seen/);
});

test("the scroll tour introduces actual capabilities independently of shot phases", () => {
  const examples = [[0, /Pickup and league/], [.2, /RSVP capacity/], [.35, /standings/],
    [.5, /follow-up/], [.7, /Web Push/], [.85, /Home Screen/]];
  for (const [progress, expected] of examples) assert.match(featureStory(progress).description, expected);
  assert.equal(featureStory(.85), featureStory(1));
  assert.equal(featureStory(.35), featureStory(.35));
});

test("hero covers dynamic viewport while keeping stable scroll travel and layered action", () => {
  const css = read("v2/styles.css");
  const html = read("index.html");
  assert.match(css, /--scene-height: 100dvh/);
  assert.match(css, /--scene-travel: calc\(100svh \* var\(--scroll-screens/);
  assert.match(css, /height: calc\(var\(--scene-travel\) \+ var\(--scene-height\)\)/);
  assert.match(css, /\.scene-content \{ background: var\(--v2-night\)/);
  assert.doesNotMatch(html, /Scroll to explore|Reverse to rewind|intro-bottomline/);
  assert.match(html, /id="soccer-stadium"[^>]*class="soccer-scene scene-backdrop"/);
  assert.match(html, /id="soccer-scene"[^>]*class="soccer-scene scene-action"/);
});

test("every pose reverses exactly with scroll, clamps input and stays finite", () => {
  const steps = Array.from({ length: 101 }, (_, index) => index / 100);
  const forward = steps.map((progress) => scenePose(progress));
  const reverse = steps.toReversed().map((progress) => scenePose(progress)).toReversed();
  assert.deepEqual(reverse, forward);
  for (const pose of forward) {
    assert.ok(Number.isFinite(pose.ball.x) && Number.isFinite(pose.ball.y));
    assert.ok(pose.reveal >= 0 && pose.reveal <= 1);
  }
  assert.deepEqual(scenePose(-1), scenePose(0));
  assert.deepEqual(scenePose(5), scenePose(1));
  assert.deepEqual(scenePose(NaN), scenePose(0));
});

test("upper-corner shot narrowly clears the outstretched glove", () => {
  const distances = Array.from({ length: 61 }, (_, index) => {
    const pose = scenePose(0.70 + index / 500);
    const angle = pose.keeper.rotation * Math.PI / 180;
    // Equal-length arms end at glove centers (+/-72, -130).
    const gloveX = pose.keeper.x - 72 * Math.cos(angle) + 130 * Math.sin(angle);
    const gloveY = pose.keeper.y - 72 * Math.sin(angle) - 130 * Math.cos(angle);
    return Math.hypot(pose.ball.x - gloveX, pose.ball.y - gloveY) - (20 * pose.ball.scale + 7);
  });
  assert.ok(Math.min(...distances) > 3, "The ball must not intersect the glove");
  assert.ok(Math.min(...distances) < 16, "The save attempt should be a near miss");
});

test("V2 installation identity is distinct and every icon is locally available", () => {
  const v1 = JSON.parse(read("manifest.webmanifest"));
  const v2 = JSON.parse(read("v2/manifest.webmanifest"));
  assert.equal(v1.start_url, "/ballerwatch/");
  assert.equal(v2.start_url, "/ballerwatch/v2/");
  assert.equal(v2.scope, "/ballerwatch/v2/");
  assert.notEqual(v1.id, v2.id);
  assert.equal(v2.display, "standalone");
  for (const icon of v2.icons) {
    assert.ok(fs.existsSync(path.resolve("frontend/web/v2", icon.src)));
  }
});

test("landscape safe areas protect the V2 cards and cinematic controls", () => {
  const css = read("v2/styles.css");
  assert.match(css, /--v2-safe-left: env\(safe-area-inset-left, 0px\)/);
  assert.match(css, /--v2-safe-right: env\(safe-area-inset-right, 0px\)/);
  assert.match(css, /\.v2-shell \{[^}]*padding-left: max\([^;]*var\(--v2-safe-left\)\);[^}]*padding-right: max\([^;]*var\(--v2-safe-right\)\)/);
});

test("V2 retains every functional controller hook and loads exactly one shared controller", () => {
  const v1 = fs.readFileSync("tests/frontend/fixtures/v1-8.14.1.html", "utf8");
  const v2 = read("index.html");
  const ids = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids(v2)).size, ids(v2).length);
  const retired = ["launch-intro", "app-version-heading", "app-version-v1", "app-version-v2",
    "owner-login-username", "user-management", "user-create-form"];
  const keptMaintenance = ["owner-login-form","owner-login-password","owner-login-status",
    "owner-password-form","owner-password-new","owner-password-confirm",
    "owner-password-status","owner-disconnect","owner-revoke",
    "owner-settings-status"];
  for (const id of ids(v1).filter((id) => !retired.includes(id) &&
    !id.startsWith("user-") &&
    (!id.startsWith("owner-") || keptMaintenance.includes(id)))) {
    assert.ok(ids(v2).includes(id), `Missing shared hook: ${id}`);
  }
  assert.equal([...v2.matchAll(/src="\.\/app\.js\?v=/g)].length, 1);
  assert.doesNotMatch(read("v2/app.js") + read("v2/timeline.js"), /fetch\(|setInterval\(/);
  assert.match(v2, /viewport-fit=cover/);
  assert.match(v2, /apple-mobile-web-app-capable/);
  assert.match(v2, /id="skip-intro" type="button"/);
  assert.match(read("v2/prepaint.js"), /2500/);
});

test("canonical preferences preserve root settings and migrate only missing retired V2 values", () => {
  const makeStore = (values) => ({ getItem: (k) => values[k] ?? null, setItem: (k, v) => { values[k] = v; } });
  const local = { "ballerwatch:v2:music": "1", "old-v1": "0" };
  const session = { "ballerwatch:v2:music": "1" };
  const context = vm.createContext({ window: { location: { pathname: "/ballerwatch/" }, localStorage: makeStore(local), sessionStorage: makeStore(session) } });
  vm.runInContext(read("lib/experience.js").replaceAll("export ", ""), context);
  assert.equal(vm.runInContext('experienceKey("old-v1", "music")', context), "old-v1");
  assert.equal(local["old-v1"], "0");
  assert.equal(session["old-v1"], "1");
  assert.match(read("lib/client.js"), /SESSION_TOKEN_KEY = "ballerwatch-owner-token"/);
  assert.match(read("lib/client.js"), /cache: "no-store"/);
  assert.doesNotMatch(read("v2/timeline.js"), /localStorage|fetch\(|setInterval/);
});

test("camera flashes are localized behind captions and reverse with scroll", () => {
  for (const [index, moment] of [.22, .40, .55, .69, .78, .87].entries()) {
    assert.equal(cameraFlash(moment, index), .8);
    assert.equal(cameraFlash(moment + .03, index), 0);
    assert.equal(cameraFlash(moment - .03, index), 0);
  }
  const html = read("index.html");
  assert.ok(html.indexOf('data-camera-flash="0"') < html.indexOf('id="scene-copy"'));
  assert.doesNotMatch(html, /id="replay-intro"|id="app-version-v1"|id="app-version-v2"/);
  assert.match(read("v2/index.html"), /http-equiv="refresh" content="5;url=\.\.\//);
});

function workerHarness(version) {
  const listeners = {};
  const removed = [];
  const keys = [
    "ballerwatch-v8-8-0-shell", "ballerwatch-v2-v8-8-0-shell",
    "ballerwatch-device-state-v1", "ballerwatch-v2-device-state-v1", "unrelated-app",
  ];
  const files = [];
  const scope = `https://example.com/ballerwatch/${version === 2 ? "v2/" : ""}`;
  const context = vm.createContext({
    URL, Response, Request, console,
    fetch: async () => { throw new Error("offline"); },
    caches: {
      keys: async () => keys,
      delete: async (key) => { removed.push(key); return true; },
      open: async () => ({
        addAll: async (list) => { files.push(...list); },
        match: async (url) => String(url).endsWith("index.html") ? new Response(`V${version}`) : null,
      }),
    },
    self: {
      location: new URL(`${scope}sw.js`),
      addEventListener: (type, callback) => { listeners[type] = callback; },
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
  });
  vm.runInContext(read("sw.js"), context);
  return { listeners, removed, files, scope, context };
}

test("both workers cache complete local shells and delete only their own obsolete shells", async () => {
  for (const version of [1, 2]) {
    const worker = workerHarness(version);
    let task;
    worker.listeners.install({ waitUntil: (promise) => { task = promise; } });
    await task;
    for (const name of worker.files) {
      const url = new URL(name, worker.scope);
      const file = path.join("frontend/web", url.pathname.replace("/ballerwatch/", ""));
      assert.ok(fs.existsSync(file), `Missing V${version} precache file: ${name}`);
    }
    worker.listeners.activate({ waitUntil: (promise) => { task = promise; } });
    await task;
    assert.ok(worker.removed.includes(version === 1
      ? "ballerwatch-v8-8-0-shell" : "ballerwatch-v2-v8-8-0-shell"));
    assert.ok(worker.removed.includes(version === 1
      ? "ballerwatch-device-state-v1" : "ballerwatch-v2-device-state-v1"));
    assert.ok(!worker.removed.includes(version === 1
      ? "ballerwatch-v2-v8-8-0-shell" : "ballerwatch-v8-8-0-shell"));
  }
});

test("offline navigation is route-specific and missing scripts never receive HTML", async () => {
  for (const version of [1, 2]) {
    const worker = workerHarness(version);
    let task;
    const fire = (url, mode) => worker.listeners.fetch({
      request: { method: "GET", url, mode },
      respondWith: (promise) => { task = promise; },
    });
    // Request objects are needed only for network-first construction.
    worker.context.Request = class { constructor(request) { Object.assign(this, request); } };
    fire(worker.scope, "navigate");
    if (version === 1) assert.equal(await (await task).text(), "V1");
    else assert.equal((await task).headers.get("location"), "https://example.com/ballerwatch/");
    fire(`${worker.scope}missing.js`, "cors");
    assert.equal((await task).type, "error");
    if (version === 1) {
      task = null;
      fire(`${worker.scope}v2/`, "navigate");
      assert.equal((await task).headers.get("location"), worker.scope);
    }
    assert.equal(vm.runInContext('safeAppUrl("https://evil.example/")', worker.context), "https://example.com/ballerwatch/");
    assert.equal(vm.runInContext('safeAppUrl("/ballerwatch/")', worker.context), "https://example.com/ballerwatch/");
  }
});

test("keeper reacts only after the fast shot has covered most of its flight", () => {
  const reaction = scenePose(SCENE.diveStart);
  assert.equal(reaction.dive, 0);
  assert.ok((reaction.ball.x - SCENE.ball.start.x) / (SCENE.ball.corner.x - SCENE.ball.start.x) > 0.75);
  assert.ok(scenePose(SCENE.flightEnd).dive < 0.5, "Ball beats the dive to goal");
});

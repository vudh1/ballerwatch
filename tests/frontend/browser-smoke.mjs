/**
 * Chromium/WebKit browser regressions at the real GitHub Pages base path.
 * Baseline: v8.10.0. All API traffic is intercepted with synthetic contracts;
 * no request from this suite can notify users, change RSVP or mutate Calendar.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fixtureResponse } from "./browser-fixtures.mjs";

const require = createRequire(import.meta.url);
const playwright = require(process.env.BALLERWATCH_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(process.env.BALLERWATCH_WEB_ROOT || "frontend/web");
const screenshotDir = process.env.BALLERWATCH_SCREENSHOT_DIR || "";
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const certificateDir = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-test-tls-"));
const certificate = path.join(certificateDir, "certificate.pem");
const key = path.join(certificateDir, "key.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
  "-out", certificate, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-days", "1"], { stdio: "ignore" });
// Match production HTTPS: WebKit correctly upgrades insecure local assets under
// the shipped CSP. The ephemeral self-signed certificate never leaves this test.
const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(certificate) }, (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (!url.pathname.startsWith("/ballerwatch/")) {
    response.writeHead(404).end();
    return;
  }
  let file = path.resolve(root, decodeURIComponent(url.pathname.slice("/ballerwatch/".length)));
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  if (url.pathname === "/ballerwatch/v1-reference.html") file = path.resolve("tests/frontend/fixtures/v1-8.14.1.html");
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    let content = fs.readFileSync(file);
    if (process.env.BALLERWATCH_CHROMIUM_SHELL === "1" && file.endsWith("/sw.js")) {
      // The restricted local runner supports headless_shell only, which exposes
      // worker badging without its native Mojo binder and kills the renderer.
      // Mock only the OS bridge there; CI runs unmodified full Chromium/WebKit.
      content = Buffer.concat([Buffer.from("self.navigator.setAppBadge = async () => {}; self.navigator.clearAppBadge = async () => {};\n"), content]);
    }
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
let scenarios = 0;

async function openHubTab(page, target) {
  if (!await page.locator("#chat-dialog").evaluate((element) => element.open)) {
    // Close a currently open hub pane through its own close button first.
    for (const [dialog, close] of [["settings", "close-settings"], ["notification", "close-notifications"]]) {
      if (await page.locator(`#${dialog}-dialog`).evaluate((element) => element.open)) await page.locator(`#${close}`).click();
    }
    await page.locator("#chat-launcher").click();
  }
  await page.locator(`#chat-dialog [data-hub-target="${target}"]`).click();
}

async function prepare(browser, options = {}) {
  // Keep API fixtures under Playwright's routing control. WebKit service-worker
  // networking can bypass those routes; exercise real workers separately below.
  const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 }, ...options });
  const calls = [];
  const errors = [];
  const controls = { offlineApi: false, optionalFailure: false, animationFailure: false, scriptFailure: false };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "ballerwatch-web.vudhone.workers.dev") {
      const headers = { "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      calls.push({ path: url.pathname, method: request.method(), authorization: request.headers().authorization || "" });
      if (controls.offlineApi || (controls.optionalFailure && ["/web/standings", "/web/board", "/web/config"].includes(url.pathname))) {
        await route.abort();
        return;
      }
      await route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(fixtureResponse(url.pathname, request.method())) });
    } else if (controls.animationFailure && url.pathname.endsWith("/stadium.svg")) {
      await route.abort();
    } else if (controls.scriptFailure && /\/v2\/(?:app|timeline)\.js$/.test(url.pathname)) {
      await route.abort();
    } else if (url.origin === origin) {
      await route.continue();
    } else {
      throw new Error(`Unmocked external request: ${url.origin}`);
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => { errors.push(error.message); console.error(`Browser error: ${error.message}`); });
  return { context, page, calls, errors, controls };
}

async function ready(page, route = "") {
  await page.goto(`${origin}/ballerwatch/${route}`);
  try {
    await page.waitForFunction(() => document.querySelector("#next-game-title").textContent.includes("October 15"), null, { timeout: 10000 });
  } catch (error) {
    await shot(page, "failure");
    console.error(await page.locator("#next-game-title").textContent());
    throw error;
  }
}

async function atProgress(page, progress) {
  await page.evaluate((value) => {
    const intro = document.querySelector("#soccer-intro");
    const stage = document.querySelector("#soccer-stage");
    window.scrollTo(0, (intro.offsetHeight - stage.clientHeight) * value);
  }, progress);
  await page.waitForFunction((value) => Math.abs(Number(document.documentElement.dataset.sceneProgress) - value) < 0.002, progress);
  return page.locator("#scene-ball").getAttribute("transform");
}

async function shot(page, name) {
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: false });
}

async function alignSyntheticCalendarCacheToToday(page) {
  // The browser fixtures use year 2099 for stable future game display.
  // Production cache validation correctly requires a same-day startDate.
  await page.evaluate(() => {
    const key = "ballerwatch-public-calendar-device-v1";
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved?.calendar) throw new Error("Expected a public device cache");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", year: "numeric",
      month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value;
    saved.calendar.startDate = [get("year"), get("month"), get("day")].join("-");
    localStorage.setItem(key, JSON.stringify(saved));
  });
}

async function scenario(name, run) {
  if (process.env.BALLERWATCH_SCENARIO && !name.includes(process.env.BALLERWATCH_SCENARIO)) return;
  await run();
  scenarios += 1;
  console.log(`PASS ${name}`);
}

try {
  for (const engine of (process.env.BALLERWATCH_BROWSERS || "chromium,webkit").split(",")) {
    const shell = process.env.BALLERWATCH_CHROMIUM_SHELL === "1";
    const browser = await playwright[engine].launch({ headless: true, ...(engine === "chromium" ? {
      ...(shell ? {} : { channel: "chromium" }),
      args: ["--no-sandbox", "--disable-gpu", "--allow-insecure-localhost", "--ignore-certificate-errors", ...(shell ? ["--disable-blink-features=Badging"] : [])],
    } : {}) });
    try {
      await scenario(`${engine}: brief brand launch leads to the hero before any cards appear`, async () => {
        const { context, page, calls, errors } = await prepare(browser);
        await page.clock.install({ time: new Date("2026-10-15T19:00:00Z") });
        await page.clock.pauseAt(new Date("2026-10-15T19:00:01Z"));
        await page.goto(`${origin}/ballerwatch/`);
        assert.equal(await page.locator("#v2-launch").isVisible(), true);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), true);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => getComputedStyle(el).opacity), "0");
        await shot(page, `${engine}-brand-launch`);
        await page.clock.runFor(1500);
        assert.equal(await page.locator("#v2-launch").isVisible(), true);
        await page.clock.runFor(600);
        assert.equal(await page.locator("#v2-launch").isVisible(), false);
        assert.equal(await page.locator("#soccer-intro").isVisible(), true);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), true);
        assert.ok(calls.some((call) => call.path === "/web/calendar"));
        await page.locator("#skip-intro").click();
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), false);
        await page.reload();
        assert.equal(await page.locator("#v2-launch").isVisible(), false);
        assert.equal(await page.locator("#soccer-intro").isVisible(), false);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: critical data loads during a reversible scroll intro; natural goal reveal`, async () => {
        const { context, page, calls, errors } = await prepare(browser);
        await ready(page);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), true);
        assert.equal(await page.locator("#soccer-intro").isVisible(), true);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        assert.equal(await page.locator("#scene-player-number").textContent(), "10");
        assert.equal(calls.filter((call) => call.path === "/web/calendar").length, 1);
        await shot(page, `${engine}-intro-setup`);
        const forward = await atProgress(page, 0.44);
        await atProgress(page, 0.73);
        assert.notEqual(await page.locator("#scene-keeper").getAttribute("transform"), "translate(1120 570) rotate(0)");
        await shot(page, `${engine}-intro-dive`);
        const reverse = await atProgress(page, 0.44);
        assert.equal(reverse, forward);
        await atProgress(page, 0.88);
        await shot(page, `${engine}-intro-goal`);
        await atProgress(page, 1);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), false);
        await page.waitForFunction(() =>
          Number(getComputedStyle(document.querySelector("#matchday-app")).opacity) > 0.95,
        { timeout: 5000 });
        await shot(page, `${engine}-matchday-desktop`);
        const cardAppearance = (target = page) => target.evaluate(() => ["#next-game-card", "#two-week-calendar"].map((selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return [style.backgroundImage, style.backgroundColor, style.borderRadius, style.padding, style.fontFamily];
        }));
        const v2Cards = await cardAppearance();
        await page.emulateMedia({ reducedMotion: "reduce" });
        const reference = await context.newPage();
        reference.on("pageerror", (error) => errors.push(error.message));
        await reference.emulateMedia({ reducedMotion: "reduce" });
        await reference.goto(`${origin}/ballerwatch/v1-reference.html`);
        assert.deepEqual(await cardAppearance(reference), v2Cards, "The canonical app uses the exact V1 card appearance");
        await reference.close();
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: feature tour keeps Settings and Inbox tappable during the reveal`, async () => {
        const { context, page, errors } = await prepare(browser);
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        for (const [progress, text] of [[.05, "Pickup and league"], [.2, "RSVP capacity"], [.4, "standings"],
          [.55, "follow-up"], [.7, "Web Push"], [.85, "Home Screen"]]) {
          await atProgress(page, progress);
          assert.ok((await page.locator("#scene-description").textContent()).includes(text));
        }
        await atProgress(page, .7);
        assert.equal(await page.locator("#chat-launcher").isVisible(), false);
        for (const progress of [.94, .96, .98, 1]) {
          await atProgress(page, progress);
          const opacity = await page.evaluate(() => ["#chat-launcher", "#matchday-app"].map((selector) => getComputedStyle(document.querySelector(selector)).opacity));
          assert.equal(opacity[0], opacity[1]);
        }
        await atProgress(page, .94);
        const before = await page.locator("#chat-launcher").boundingBox();
        await atProgress(page, .98);
        assert.deepEqual(await page.locator("#chat-launcher").boundingBox(), before);
        assert.equal(await page.locator("#chat-launcher").evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button") === el;
        }), true, "The fading hero must not intercept the hub");
        await page.locator("#chat-launcher").click();
        await page.locator('#chat-dialog [data-hub-target="settings"]').click();
        assert.equal(await page.locator("#settings-dialog").evaluate((el) => el.open), true);
        await page.locator('#settings-dialog [data-hub-target="notifications"]').click();
        assert.equal(await page.locator("#notification-dialog").evaluate((el) => el.open), true);
        await page.locator('#notification-dialog [data-hub-target="ai"]').click();
        assert.equal(await page.locator("#chat-dialog").evaluate((el) => el.open), true);
        await page.locator("#close-chat").click();
        await shot(page, `${engine}-glass-reveal`);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: full-screen stadium and foreground action surround borderless feature text`, async () => {
        const { context, page, errors } = await prepare(browser, {
          viewport: { width: 390, height: 560 }, isMobile: true, hasTouch: true,
        });
        await context.addInitScript(() => { Object.defineProperty(navigator, "standalone", { value: true }); });
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        assert.doesNotMatch(await page.locator("#soccer-intro").textContent(), /scroll to explore|reverse to rewind/i);
        const caption = await page.locator("#scene-copy").evaluate((el) => {
          const css = getComputedStyle(el);
          return [css.borderTopWidth, css.backgroundColor, css.boxShadow, css.backdropFilter];
        });
        assert.deepEqual(caption, ["0px", "rgba(0, 0, 0, 0)", "none", "none"]);
        await atProgress(page, .78);
        const occlusion = await page.evaluate(() => {
          const copy = document.querySelector("#scene-copy");
          const action = document.querySelector("#soccer-scene");
          // Hit-test painted SVG pixels at their real positions over the caption.
          copy.style.pointerEvents = "auto";
          action.style.pointerEvents = "auto";
          const points = [
            ["#scene-ball", 0, 0], ["#scene-keeper", -72, -130],
          ];
          const result = points.map(([selector, x, y]) => {
            const element = document.querySelector(selector);
            const point = new DOMPoint(x, y).matrixTransform(element.getScreenCTM());
            const front = Boolean(document.elementFromPoint(point.x, point.y)?.closest(selector));
            action.style.visibility = "hidden";
            const overCopy = Boolean(document.elementFromPoint(point.x, point.y)?.closest("#scene-copy"));
            action.style.visibility = "";
            return { front, overCopy };
          });
          copy.style.pointerEvents = "";
          action.style.pointerEvents = "";
          return result;
        });
        await shot(page, `${engine}-foreground-text`);
        assert.deepEqual(occlusion, [{ front: true, overCopy: true }, { front: true, overCopy: true }]);
        await shot(page, `${engine}-foreground-text`);
        for (const viewport of [{ width: 390, height: 950 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          await atProgress(page, .85);
          const coverage = await page.evaluate(() => {
            const stage = document.querySelector("#soccer-stage").getBoundingClientRect();
            const content = document.querySelector("#scene-scene-content");
            const screenHeight = window.visualViewport?.height || window.innerHeight;
            const scenes = [...document.querySelectorAll(".soccer-scene")];
            return {
              top: stage.top, bottom: stage.bottom, screenHeight,
              background: getComputedStyle(content).backgroundColor,
              opacity: getComputedStyle(content).opacity,
              atBottom: Boolean(document.elementFromPoint(window.innerWidth / 2, screenHeight - 4)?.closest("#scene-scene-content")),
              views: scenes.map((el) => el.getAttribute("viewBox")),
              cameras: ["#scene-world", "#scene-background-world"].map((id) => document.querySelector(id).getAttribute("transform")),
            };
          });
          assert.ok(Math.abs(coverage.top) <= 1 && coverage.bottom >= coverage.screenHeight - 1);
          assert.equal(coverage.atBottom, true, "The animation must cover the viewport footer before the reveal");
          assert.equal(coverage.background, "rgb(6, 26, 24)");
          assert.equal(coverage.opacity, "1");
          assert.equal(coverage.views[0], coverage.views[1]);
          assert.equal(coverage.cameras[0], coverage.cameras[1]);
        }
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: legacy V2 links converge on the root and notification checks sit beside text`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await context.addInitScript(() => localStorage.setItem("ballerwatch-visitor-profile-v1-24h", JSON.stringify({ schema:1, expiresAt:Date.now()+86_400_000, data:{ name:"Sample visitor", teams:[] } })));
        await ready(page, "v2/?from=legacy#matches");
        assert.equal(new URL(page.url()).pathname, "/ballerwatch/");
        assert.equal(new URL(page.url()).search, "?from=legacy");
        assert.equal(new URL(page.url()).hash, "#matches");
        await openHubTab(page, "settings");
        assert.equal(await page.locator("#guest-name").inputValue(), "Sample visitor");
        assert.equal(await page.locator("#replay-intro,#app-version-v1,#app-version-v2").count(), 0);
        await page.locator("#close-settings").click();
        await openHubTab(page, "notifications");
        for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          const checks = await page.locator(".notification-preference-options label").evaluateAll((labels) => labels.map((label) => {
            const check = label.querySelector("input").getBoundingClientRect();
            const text = label.querySelector("span").getBoundingClientRect();
            return check.width <= 18 && text.left - check.right >= 0 && text.left - check.right < 12 && Math.abs(check.y + check.height / 2 - text.y - text.height / 2) < 3;
          }));
          assert.deepEqual(checks, [true, true, true]);
        }
        await shot(page, `${engine}-notification-alignment`);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: three-way forecast uses initials and a borderless shared track`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        await page.locator("#spotlight-next").click();
        await page.waitForFunction(() => document.querySelector("#next-game-form")?.textContent.includes("FFC 45%"));
        assert.deepEqual(await page.locator("#next-game-form .win-chance-labels span").allTextContents(),
          ["FFC 45%", "TU 35%"]);
        assert.ok(await page.locator("#next-game-form").evaluate((element) => {
          const address = document.querySelector("#next-game-location");
          const style = getComputedStyle(element);
          return Boolean(address.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            style.gridArea === "form" &&
            element.getBoundingClientRect().top >= address.getBoundingClientRect().top &&
            element.getBoundingClientRect().width >= address.getBoundingClientRect().width;
        }));
        const appearance = await page.locator("#next-game-form").evaluate((element) => {
          const css = getComputedStyle(element);
          return { border: css.borderTopWidth, padding: css.paddingTop,
            background: css.backgroundColor, aria: element.getAttribute("aria-label") };
        });
        assert.equal(appearance.border, "0px");
        assert.equal(appearance.padding, "0px");
        assert.equal(appearance.background, "rgba(0, 0, 0, 0)");
        assert.match(appearance.aria, /Fixture FC win 45%, tie 20%, Test United win 35%/);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: guest settings, local notifications and favorite teams need no sign-in`, async () => {
        const { context, page, errors, calls } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        await page.waitForSelector(".standings-team-link");
        await openHubTab(page, "settings");
        assert.equal(await page.locator("#guest-settings-view").isVisible(), true);
        assert.equal(await page.locator("#settings-login-view").evaluate((el) => el.open), false);
        await page.locator("#guest-name").fill("Visitor");
        await page.locator("#guest-teams-trigger").click();
        assert.match(await page.locator("#guest-teams-display").textContent(), /1 team selected/);
        await page.locator("#guest-teams-search").fill("Test United");
        await page.locator('#guest-teams-options [role="option"]').first().click();
        await page.waitForFunction(() => {
          const raw = localStorage.getItem("ballerwatch-visitor-profile-v1-24h");
          if (!raw) return false;
          const profile = JSON.parse(raw).data;
          return profile.name === "Visitor" &&
            profile.teams.includes("Fixture FC") && profile.teams.includes("Test United");
        });
        await page.waitForFunction(() =>
          document.querySelector("#guest-settings-status")?.textContent.startsWith("Saved."));
        const profile = await page.evaluate(() => JSON.parse(localStorage.getItem("ballerwatch-visitor-profile-v1-24h")).data);
        assert.equal(profile.name, "Visitor");
        assert.deepEqual(profile.teams, ["Fixture FC", "Test United"]);
        assert.ok(calls.filter((call) => call.path === "/web/calendar").length >= 2,
          "Adding a monitored team fetches personalized fixtures immediately");
        assert.ok(calls.filter((call) => call.path === "/web/standings").length >= 2,
          "Adding a monitored team refreshes standings immediately");
        assert.equal(calls.filter((call) => call.path === "/web/user/settings" && call.method === "POST").length, 0);
        await page.locator("#close-settings").click();
        await openHubTab(page, "notifications");
        await page.locator("#notification-pref-pickup").uncheck();
        assert.equal(await page.evaluate(() =>
          JSON.parse(localStorage.getItem("ballerwatch-notification-channels-v1-24h")).data.channels.pickup), false);
        await page.reload();
        await ready(page);
        await openHubTab(page, "settings");
        assert.equal(await page.locator("#guest-name").inputValue(), "Visitor");
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: two same-day matches display two dots and both match cards`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        const day = page.locator('.calendar-day[data-date="2099-10-18"]');
        assert.equal(await day.locator(".calendar-signal-dot").count(), 2);
        assert.equal(await page.locator("#calendar-game-picker").isVisible(), false);
        await day.click();
        assert.match(await page.locator("#next-game-meta").textContent(), /Fixture FC vs Test United/);
        await page.locator("#spotlight-next").click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-meta")?.textContent.includes("Fixture FC vs Second FC"));
        await page.locator("#spotlight-previous").click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-meta")?.textContent.includes("Fixture FC vs Test United"));
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: saved public standings and match odds paint before offline verification`, async () => {
        const { context, page, controls, errors, calls } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        await page.waitForSelector(".standings-team-link");
        await alignSyntheticCalendarCacheToToday(page);
        controls.offlineApi = true;
        const requestsBeforeReload = calls.length;
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-title")?.textContent.includes("October 15") &&
          document.querySelector(".standings-team-link")?.textContent === "Fixture FC");
        assert.ok(await page.locator(".standings-team-link").count() >= 2);
        assert.ok(calls.length > requestsBeforeReload, "Background verification should still be attempted");
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: skip, direct refresh, navigation, iPhone portrait and landscape`, async () => {
        const { context, page, errors } = await prepare(browser, { ...playwright.devices["iPhone 13"], defaultBrowserType: undefined });
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await shot(page, `${engine}-intro-iphone`);
        if (engine === "chromium") {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 190, y: 550, id: 1 }] });
          for (let step = 1; step <= 12; step += 1) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove", touchPoints: [{ x: 190, y: 550 - step * 25, id: 1 }],
            });
            await page.waitForTimeout(16);
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await page.waitForFunction(() => Number(document.documentElement.dataset.sceneProgress) > 0.02);
          await cdp.detach();
        }
        let navigations = 0;
        page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
        await page.locator("#skip-intro").click();
        assert.equal(navigations, 0);
        await page.waitForFunction(() => !document.querySelector("#matchday-app").inert);
        await shot(page, `${engine}-matchday-iphone`);
        assert.equal(await page.locator(".v2-quick-actions").count(), 0, "No detached header controls");
        await atProgress(page, .44);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), true);
        assert.equal(await page.locator("#soccer-intro").isVisible(), true, "Skip preserves upward rewind");
        await atProgress(page, 1);
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true" && !document.querySelector("#matchday-app").inert);
        assert.ok(await page.locator("#matchday-heading").evaluate((el) => el.getBoundingClientRect().top >= 0), "Reload immediately after Skip must retain the main header position");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.locator("#two-week-calendar").scrollIntoViewIfNeeded();
        assert.equal(await page.locator("#two-week-calendar").isVisible(), true);
        await page.locator('.calendar-day[aria-disabled="false"]').first().click();
        assert.equal(await page.locator("#next-game-card").isVisible(), true);
        await page.locator("#league-standings").scrollIntoViewIfNeeded();
        await page.waitForSelector(".standings-team-link");
        assert.equal(await page.locator("#league-standings").isVisible(), true);
        await shot(page, `${engine}-club-iphone`);
        await openHubTab(page, "notifications");
        assert.equal(await page.locator("#notification-dialog").evaluate((el) => el.open), true);
        await page.locator("#close-notifications").click();
        await page.locator("#chat-launcher").click();
        assert.equal(await page.locator("#chat-dialog").evaluate((el) => el.open), true);
        await page.locator("#close-chat").click();
        await page.reload();
        await page.waitForFunction(() => !document.querySelector("#matchday-app").inert);
        assert.equal(new URL(page.url()).pathname, "/ballerwatch/");
        assert.equal(await page.locator("#soccer-intro").isVisible(), false);
        await page.setViewportSize({ width: 844, height: 390 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        // Device emulation reports zero hardware safe areas. Inject asymmetric
        // landscape insets to verify that the rail and header stay inside them.
        await page.evaluate(() => {
          document.documentElement.style.setProperty("--v2-safe-left", "59px");
          document.documentElement.style.setProperty("--v2-safe-right", "34px");
        });
        assert.ok(await page.locator("#next-game-card").evaluate((el) => el.getBoundingClientRect().left >= 59));
        assert.ok(await page.locator("#chat-launcher").evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth - 34));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await shot(page, `${engine}-matchday-landscape`);
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("--v2-safe-left");
          document.documentElement.style.removeProperty("--v2-safe-right");
        });
        await page.evaluate(() => sessionStorage.removeItem("ballerwatch:v2:intro-seen"));
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
        await atProgress(page, 0.7);
        await page.setViewportSize({ width: 390, height: 760 });
        assert.ok(await page.locator("#skip-intro").isVisible());
        await page.locator("#skip-intro").click();
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: reduced motion, standalone mode and asset/script failure reveal the app`, async () => {
        const reduced = await prepare(browser, { ...playwright.devices["iPhone 13"], reducedMotion: "reduce" });
        await reduced.context.addInitScript(() => { Object.defineProperty(navigator, "standalone", { value: true }); });
        await ready(reduced.page);
        assert.equal(await reduced.page.locator("#soccer-intro").isVisible(), false);
        assert.equal(await reduced.page.locator(".v2-static-welcome").isVisible(), true);
        assert.equal(await reduced.page.locator("#install-card").count(), 0);
        assert.equal(await reduced.page.locator("#matchday-app").evaluate((el) => el.inert), false);
        await shot(reduced.page, `${engine}-reduced-standalone`);
        await openHubTab(reduced.page, "settings");
        assert.equal(await reduced.page.locator("#replay-intro").count(), 0);
        await reduced.context.close();
        for (const failure of ["animationFailure", "scriptFailure"]) {
          const instance = await prepare(browser, { serviceWorkers: "block" });
          instance.controls[failure] = true;
          console.log(`Checking ${engine} fallback: ${failure}`);
          await ready(instance.page);
          await instance.page.waitForFunction(() => !document.querySelector("#matchday-app").inert, null, { timeout: 5000 });
          assert.equal(await instance.page.locator("#next-game-title").textContent(), "Thursday, October 15");
          await instance.context.close();
        }
      });

      await scenario(`${engine}: maintenance unlock is session-only; private rosters still require authorization`, async () => {
        const { context, page, calls, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page, "");
        await openHubTab(page, "settings");
        await page.locator("#settings-login-view summary").click();
        await page.locator("#owner-login-password").fill("synthetic-only-password");
        await page.locator('#owner-login-form button[type="submit"]').click();
        await page.waitForFunction(() => sessionStorage.getItem("ballerwatch-owner-token") === "synthetic-browser-session");
        await page.locator("#close-settings").click();
        await ready(page);
        await openHubTab(page, "settings");
        await page.waitForSelector("#settings-owner-view:not([hidden])");
        await page.locator("#close-settings").click();
        await page.locator("#next-game-capacity").click();
        await page.waitForSelector("#rsvp-roster-confirmed-list li");
        assert.ok(calls.some((call) => call.path === "/web/user/rsvp-roster" && call.authorization === "Bearer synthetic-browser-session"));
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: optional failures preserve match data and original root preferences`, async () => {
        const instance = await prepare(browser, { reducedMotion: "reduce" });
        await instance.context.addInitScript(() => {
          localStorage.setItem("ballerwatch-music-enabled-v1", "0");
          sessionStorage.setItem("ballerwatch-intro-seen-v1", "v1-sentinel");
          sessionStorage.setItem("ballerwatch-public-calendar-session-v1", "v1-sentinel");
        });
        instance.controls.optionalFailure = true;
        await ready(instance.page);
        assert.equal(await instance.page.locator("#system-status").textContent(), "Live");
        assert.deepEqual(await instance.page.evaluate(() => [
          localStorage.getItem("ballerwatch-music-enabled-v1"),
          sessionStorage.getItem("ballerwatch-intro-seen-v1"),
        ]), ["0", "v1-sentinel"]);
        assert.equal(await instance.page.evaluate(() => JSON.parse(sessionStorage.getItem("ballerwatch-public-calendar-session-v1")).calendar.games[0].id), "pickup:2099-10-15");
        await alignSyntheticCalendarCacheToToday(instance.page);
        instance.controls.offlineApi = true;
        await instance.page.reload();
        await instance.page.waitForFunction(() => document.querySelector("#next-game-title").textContent.includes("October 15"));
        // One transient outage is not enough to label saved fixtures stale:
        // the last-good schedule stays visible with an honest neutral status.
        await instance.page.waitForFunction(() => document.querySelector("#system-status").textContent === "Ready");
        assert.equal(await instance.page.locator("#system-status").textContent(), "Ready");
        assert.match(await instance.page.locator("#calendar-updated").textContent(), /Updated/);
        await instance.context.close();
      });

      if (engine === "chromium") {
        await scenario("chromium: legacy installed worker migrates to canonical root; offline redirects and scoped cache clearing", async () => {
          const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce", serviceWorkers: "allow" });
          await ready(page);
          await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
          await page.evaluate(async () => {
            const legacy = await navigator.serviceWorker.register("./v2/sw.js", { scope: "./v2/", updateViaCache: "none" });
            if (!legacy.active) await new Promise((resolve) => {
              const worker = legacy.installing || legacy.waiting;
              worker.addEventListener("statechange", () => { if (worker.state === "activated") resolve(); });
            });
          });
          await ready(page, "v2/");
          assert.equal(new URL(page.url()).pathname, "/ballerwatch/");
          await alignSyntheticCalendarCacheToToday(page);
          await context.unrouteAll({ behavior: "wait" });
          await context.setOffline(true);
          await page.goto(`${origin}/ballerwatch/v2/`, { waitUntil: "domcontentloaded" });
          assert.equal(new URL(page.url()).pathname, "/ballerwatch/");
          await page.waitForFunction(() => document.querySelector("#next-game-title")?.textContent === "Thursday, October 15", null, { timeout: 8000 });
          const before = await page.evaluate(() => caches.keys());
          assert.ok(before.some((key) => key.startsWith("ballerwatch-v2-") && key.endsWith("-shell")));
          await openHubTab(page, "settings");
          await page.locator("#v2-offline-tools").evaluate((el) => { el.open = true; });
          await page.locator("#clear-v2-caches").click();
          await page.waitForFunction(() => document.querySelector("#v2-cache-status").textContent.includes("cleared"));
          const after = await page.evaluate(() => caches.keys());
          assert.ok(after.some((key) => key.startsWith("ballerwatch-v2-") && key.endsWith("-shell")));
          assert.ok(after.includes("ballerwatch-device-state-v2"));
          assert.deepEqual(errors, []);
          await context.close();
        });
      }
    } finally { await browser.close(); }
  }
  console.log(`Browser validation passed: ${scenarios} scenarios.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(certificateDir, { recursive: true, force: true });
}

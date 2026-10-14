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

async function ready(page, route = "v2/") {
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
    window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * value);
  }, progress);
  await page.waitForFunction((value) => Math.abs(Number(document.documentElement.dataset.sceneProgress) - value) < 0.002, progress);
  return page.locator("#scene-ball").getAttribute("transform");
}

async function shot(page, name) {
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: false });
}

async function scenario(name, run) {
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
      await scenario(`${engine}: critical data loads during a reversible scroll intro; natural goal reveal`, async () => {
        const { context, page, calls, errors } = await prepare(browser);
        await ready(page);
        assert.equal(await page.locator("#matchday-app").evaluate((el) => el.inert), false);
        assert.equal(await page.locator("#soccer-intro").isVisible(), true);
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
        assert.ok(await page.locator("#panel-matchday .v2-match-grid").evaluate((el) => Number(getComputedStyle(el).opacity) > 0.95));
        await shot(page, `${engine}-matchday-desktop`);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: skip, direct refresh, navigation, iPhone portrait and landscape`, async () => {
        const { context, page, errors } = await prepare(browser, { ...playwright.devices["iPhone 13"], defaultBrowserType: undefined });
        await ready(page);
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
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.locator('.v2-bottom-nav [data-v2-target="schedule"]').click();
        assert.equal(await page.locator("#panel-schedule").isVisible(), true);
        await page.locator('.calendar-day[aria-disabled="false"]').first().click();
        assert.equal(await page.locator("#panel-matchday").isVisible(), true);
        await page.locator('.v2-bottom-nav [data-v2-target="club"]').click();
        await page.waitForSelector(".standings-team-link");
        assert.equal(await page.locator("#panel-club").isVisible(), true);
        await shot(page, `${engine}-club-iphone`);
        await page.locator("#v2-inbox").click();
        assert.equal(await page.locator("#notification-dialog").evaluate((el) => el.open), true);
        await page.locator("#close-notifications").click();
        await page.locator('.v2-bottom-nav [data-v2-target="matchday"]').click();
        await page.locator("#v2-ai").click();
        assert.equal(await page.locator("#chat-dialog").evaluate((el) => el.open), true);
        await page.locator("#close-chat").click();
        await page.reload();
        await page.waitForFunction(() => !document.querySelector("#matchday-app").inert);
        assert.equal(new URL(page.url()).pathname, "/ballerwatch/v2/");
        assert.equal(await page.locator("#soccer-intro").isVisible(), true);
        await page.setViewportSize({ width: 844, height: 390 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        // Device emulation reports zero hardware safe areas. Inject asymmetric
        // landscape insets to verify that the rail and header stay inside them.
        await page.evaluate(() => {
          document.documentElement.style.setProperty("--v2-safe-left", "59px");
          document.documentElement.style.setProperty("--v2-safe-right", "34px");
        });
        assert.ok(await page.locator(".v2-sidebar").evaluate((el) => el.getBoundingClientRect().left >= 59));
        assert.ok(await page.locator("#settings-button").evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth - 34));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await shot(page, `${engine}-matchday-landscape`);
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("--v2-safe-left");
          document.documentElement.style.removeProperty("--v2-safe-right");
        });
        await page.locator("#replay-intro").click();
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

      await scenario(`${engine}: shared session restores in V1/V2; private rosters use authorized APIs only`, async () => {
        const { context, page, calls, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page, "");
        await page.locator("#settings-button").click();
        await page.locator("#owner-login-username").fill("fixture");
        await page.locator("#owner-login-password").fill("synthetic-only-password");
        await page.locator('#owner-login-form button[type="submit"]').click();
        await page.waitForFunction(() => localStorage.getItem("ballerwatch-owner-token") === "synthetic-browser-session");
        await page.locator("#close-settings").click();
        await ready(page);
        await page.locator("#settings-button").click();
        await page.waitForSelector("#settings-owner-view:not([hidden])");
        await page.locator("#close-settings").click();
        await page.locator("#next-game-capacity").click();
        await page.waitForSelector("#rsvp-roster-confirmed-list li");
        assert.ok(calls.some((call) => call.path === "/web/user/rsvp-roster" && call.authorization === "Bearer synthetic-browser-session"));
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: optional failures preserve match data, experience storage stays isolated`, async () => {
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
          sessionStorage.getItem("ballerwatch-public-calendar-session-v1"),
        ]), ["0", "v1-sentinel", "v1-sentinel"]);
        instance.controls.offlineApi = true;
        await instance.page.reload();
        await instance.page.waitForFunction(() => document.querySelector("#next-game-title").textContent.includes("October 15"));
        await instance.page.waitForFunction(() => document.querySelector("#system-status").textContent === "Last synced");
        assert.equal(await instance.page.locator("#system-status").textContent(), "Last synced");
        await instance.context.close();
      });

      if (engine === "chromium") {
        await scenario("chromium: two service-worker scopes coexist, offline routes stay correct and cache clearing preserves V1", async () => {
          const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce", serviceWorkers: "allow" });
          await ready(page, "");
          await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
          await ready(page);
          await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes("/v2/sw.js"));
          const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope).sort());
          assert.deepEqual(registrations, [`${origin}/ballerwatch/`, `${origin}/ballerwatch/v2/`]);
          const keys = await page.evaluate(() => caches.keys());
          assert.ok(keys.some((key) => /^ballerwatch-v\d/.test(key) && !key.startsWith("ballerwatch-v2-")));
          assert.ok(keys.some((key) => key.startsWith("ballerwatch-v2-") && key.endsWith("-shell")));
          await context.unrouteAll({ behavior: "wait" });
          await context.setOffline(true);
          await page.reload({ waitUntil: "domcontentloaded" });
          assert.equal(new URL(page.url()).pathname, "/ballerwatch/v2/");
          await page.waitForFunction(() => !document.querySelector("#matchday-app").inert);
          assert.equal(await page.locator("#next-game-title").textContent(), "Thursday, October 15");
          await page.goto(`${origin}/ballerwatch/`, { waitUntil: "domcontentloaded" });
          assert.equal(await page.locator(".brand-lockup h1").textContent(), "BallerWatch");
          await context.route("**ballerwatch-web.vudhone.workers.dev/**", (route) => route.fulfill({
            headers: { "access-control-allow-origin": origin },
            contentType: "application/json", body: JSON.stringify(fixtureResponse(new URL(route.request().url()).pathname)),
          }));
          await context.setOffline(false);
          // Cache controls never unregister either service worker or clear account storage.
          await page.goto(`${origin}/ballerwatch/v2/`);
          await page.waitForFunction(() => !document.querySelector("#matchday-app").inert);
          await page.locator(".v2-experience-tools details").evaluate((el) => { el.open = true; });
          await page.locator("#clear-v2-caches").click();
          await page.waitForFunction(() => document.querySelector("#v2-cache-status").textContent.includes("cleared"));
          const remaining = await page.evaluate(() => caches.keys());
          assert.ok(remaining.some((key) => /^ballerwatch-v\d/.test(key) && !key.startsWith("ballerwatch-v2-")));
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

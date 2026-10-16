/**
 * v9.1.0: ten fresh production tester sessions with anonymous public GETs.
 * Writes are blocked; the AI response alone is synthetic to avoid retention.
 * No login, RSVP, push, Calendar mutation or private fixture is exercised here.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BALLERWATCH_PLAYWRIGHT_MODULE || "playwright");
const origin = "https://vudh1.github.io";
const apiOrigin = "https://ballerwatch-web.vudhone.workers.dev";
const version = JSON.parse(fs.readFileSync("features/versions.json", "utf8")).currentVersion;
const output = process.env.BALLERWATCH_TESTER_OUTPUT || "/tmp/ballerwatch-production-tester";
fs.mkdirSync(output, { recursive: true });
const shell = process.env.BALLERWATCH_CHROMIUM_SHELL === "1";
const browser = await chromium.launch({ ...(shell ? {} : { channel: "chromium" }), headless: true,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  args: ["--no-sandbox", "--disable-gpu", "--ignore-certificate-errors", ...(shell ? ["--disable-blink-features=Badging"] : [])] });
const reports = [];
const staticAssets = new Map();
async function progress(page, value) {
  await page.evaluate((p) => {
    const intro = document.querySelector("#soccer-intro"), stage = document.querySelector("#soccer-stage");
    window.scrollTo(0, (intro.offsetHeight - stage.clientHeight) * p);
  }, value);
  await page.waitForFunction((p) => Math.abs(Number(document.documentElement.dataset.sceneProgress) - p) < .003, value);
}
async function enter(page) {
  await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
  await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
  if (await page.locator("#matchday-app").evaluate((el) => el.inert)) await page.locator("#skip-intro").click();
  await page.waitForFunction(() => !document.querySelector("#matchday-app").inert);
}
async function pane(page, from, to) {
  await page.locator(`#${from}-dialog [data-hub-target="${to}"]`).click();
  const name = to === "ai" ? "chat" : to === "notifications" ? "notification" : to;
  assert.ok(await page.locator(`#${name}-dialog`).evaluate((el) => el.open));
}
try {
  for (let pass = Number(process.env.BALLERWATCH_TESTER_FROM || 1); pass <= 10; pass += 1) {
    const startedAt = Date.now();
    const viewport = pass === 1 ? { width: 1440, height: 1000 } : pass === 8 ? { width: 844, height: 390 } :
      { width: pass === 9 ? 320 : 390, height: pass === 9 ? 568 : 844 };
    const context = await browser.newContext({ viewport, isMobile: pass > 1, hasTouch: pass > 1,
      reducedMotion: [4, 5, 6, 7, 10].includes(pass) ? "reduce" : "no-preference",
      serviceWorkers: pass === 10 ? "allow" : "block", ignoreHTTPSErrors: true });
    if (shell) context.on("serviceworker", (worker) => {
      void worker.evaluate(() => {
        // Replace only the unavailable native OS bridge, preserving fetched
        // production worker bytes and its installation/update lifecycle.
        self.navigator.setAppBadge = async () => {};
        self.navigator.clearAppBadge = async () => {};
      }).catch(() => {});
    });
    const errors = [], checked = new Set();
    let unavailable = false, interceptedQuestion = false, publicReads = 0;
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === apiOrigin && request.method() === "POST" && url.pathname === "/web/ask") {
        interceptedQuestion = true;
        await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": origin },
          body: JSON.stringify({ ok: true, intent: "league_scout", reply: "Synthetic tester answer. Actual scouting reports are prepared hourly.", sources: [] }) });
      } else if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) await route.abort();
      else if (url.origin === apiOrigin && unavailable) await route.abort();
      else if (url.origin === origin || url.origin === apiOrigin) {
        let response;
        try {
          if (url.origin === apiOrigin) {
            // The restricted runner's browser UA is challenged by the edge.
            // Relay real anonymous reads through Node, preserving API headers;
            // no production question or mutation is sent.
            const headers = { origin, accept: "application/json" };
            if (request.method() === "OPTIONS") {
              for (const name of ["access-control-request-method", "access-control-request-headers"]) {
                if (request.headers()[name]) headers[name] = request.headers()[name];
              }
            }
            const remote = await fetch(url.href, { method: request.method(), headers,
              cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) });
            const body = Buffer.from(await remote.arrayBuffer());
            response = { status: () => remote.status, headers: () => Object.fromEntries(remote.headers),
              body: async () => body, json: async () => JSON.parse(body.toString()) };
          } else response = staticAssets.get(url.href) || await route.fetch();
        }
        catch { try { await route.abort(); } catch { /* A closing page cancels pending reads. */ } return; }
        if (url.origin === apiOrigin && request.method() === "GET" && response.status() === 200) publicReads += 1;
        if (url.origin === apiOrigin && url.pathname === "/web/config" && response.status() === 200) {
          const value = await response.json();
          assert.equal(value.version, version, "Worker release must match source");
        }
        const headers = response.headers();
        for (const key of ["content-encoding", "content-length", "transfer-encoding"]) delete headers[key];
        const body = await response.body();
        if (url.origin === origin && !staticAssets.has(url.href)) {
          const status = response.status(), savedHeaders = response.headers(), savedBody = body;
          staticAssets.set(url.href, { status: () => status, headers: () => ({ ...savedHeaders }), body: async () => savedBody });
        }
        if (url.origin === origin) {
          const relative = url.pathname.replace(/^\/ballerwatch\//, "") || "index.html";
          const local = path.join("frontend/web", relative.endsWith("/") ? relative + "index.html" : relative);
          if (fs.existsSync(local) && fs.statSync(local).isFile()) {
            assert.equal(createHash("sha256").update(body).digest("hex"), createHash("sha256").update(fs.readFileSync(local)).digest("hex"), `Published asset ${relative}`);
            checked.add(relative);
          }
        }
        await route.fulfill({ status: response.status(), headers, body });
      } else await route.abort();
    });
    if (pass === Number(process.env.BALLERWATCH_TESTER_FROM || 1)) {
      // Warm exact production bytes through the proxy before timing the brand
      // animation. A fresh page below retains fresh session-only launch state.
      unavailable = true;
      const warmup = await context.newPage();
      await warmup.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {}); });
      await warmup.goto(`${origin}/ballerwatch/`);
      await warmup.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
      await warmup.close();
      unavailable = false;
    }
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/ballerwatch/${pass === 7 ? "v2/?tester=legacy#matches" : ""}`);
    console.log(`START production tester session ${pass}/10`);
    await page.screenshot({ path: path.join(output, `start-${pass}.png`) });
    if (pass === 1) {
      await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
      await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
      for (const p of [0, .2, .4, .6, .68, .78, .94, 1]) {
        await progress(page, p);
        if ([0, .6, .68, .78].includes(p)) await page.screenshot({ path: path.join(output, `hero-${p}.png`) });
      }
      assert.ok(await page.locator("#scene-captain-band").count());
    } else await enter(page);
    await page.waitForFunction(() => document.querySelector("#system-status").textContent.includes("Live"), null, { timeout: 45000 });
    if (pass === 2) {
      for (let i = 0; i < 10; i += 1) {
        const forward = await page.locator("#scene-ball").getAttribute("transform");
        await progress(page, .42);
        assert.ok(await page.locator("#matchday-app").evaluate((el) => el.inert));
        await page.locator("#skip-intro").click();
        assert.equal(await page.locator("#scene-ball").getAttribute("transform"), forward);
      }
    }
    if (pass === 2) {
      await page.reload();
      await enter(page);
      assert.ok(await page.locator("#matchday-heading").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }), "Reload after Skip must restore the main header position");
    }
    if ([3, 4, 6, 8, 9].includes(pass)) {
      await page.locator("#chat-launcher").click();
      await pane(page, "chat", "settings");
      if (pass === 3) await page.screenshot({ path: path.join(output, "settings.png") });
      assert.equal(await page.locator("#replay-intro,.v2-quick-actions").count(), 0);
      await pane(page, "settings", "notifications");
      if ([3, 4, 8, 9].includes(pass)) await page.screenshot({ path: path.join(output, `notifications-${pass}.png`) });
      const checks = await page.locator(".notification-preference-options label").evaluateAll((labels) => labels.map((label) => {
        const a = label.querySelector("input").getBoundingClientRect(), b = label.querySelector("span").getBoundingClientRect();
        return a.width <= 18 && b.left - a.right >= 0 && b.left - a.right < 12;
      }));
      assert.deepEqual(checks, [true, true, true]);
      if (pass === 4) {
        for (const filter of ["pickup", "league", "version", "all"]) {
          const button = page.locator(`[data-notification-filter="${filter}"]`);
          if (await button.count()) await button.click();
        }
      }
      await pane(page, "notification", "ai");
      if (pass === 6) { await page.keyboard.press("Escape"); assert.ok(!await page.locator("#chat-dialog").evaluate((el) => el.open)); }
      else await page.locator("#close-chat").click();
    }
    if (pass === 5) {
      await page.locator("#chat-launcher").click();
      await page.locator("#question").fill("Explain the scouting model");
      await page.locator('#question-form button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector("#answer").textContent.includes("Synthetic tester answer"));
      assert.ok(interceptedQuestion);
      await page.screenshot({ path: path.join(output, "ai-answer.png") });
      await page.locator("#close-chat").click();
    }
    if (pass === 7) {
      assert.equal(new URL(page.url()).search, "?tester=legacy");
      assert.equal(new URL(page.url()).hash, "#matches");
    }
    if (pass === 8) {
      await page.setViewportSize({ width: 390, height: 844 });
      await progress(page, .55);
      assert.equal(await page.locator("#soccer-stage").evaluate((el) => el.clientHeight), 844);
      await page.locator("#skip-intro").click();
    }
    if (pass === 9) {
      await page.waitForFunction(() => document.querySelector("#system-status").textContent.includes("Live"), null, { timeout: 40000 });
      const cachedTitle = await page.locator("#next-game-title").textContent();
      unavailable = true;
      await page.reload();
      await enter(page);
      await page.waitForFunction((text) => document.querySelector("#next-game-title").textContent === text, cachedTitle);
    }
    if (pass === 10) {
      await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration("/ballerwatch/");
        return registration?.active?.state === "activated";
      }, null, { timeout: 40000 });
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
      await page.goto(`${origin}/ballerwatch/v2/?tester=offline#matches`);
      await enter(page);
      assert.equal(new URL(page.url()).pathname, "/ballerwatch/");
      assert.equal(new URL(page.url()).search, "?tester=offline");
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, `pass-${pass}.png`), fullPage: false });
    reports.push({ pass, viewport, result: "passed", sourceMatchedAssets: checked.size,
      publicReads, seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)), syntheticAi: pass === 5, offline: pass === 10 });
    console.log(`PASS production tester session ${pass}/10`);
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ version, testedAt: new Date().toISOString(), reports }, null, 2) + "\n");
} finally { await browser.close(); }

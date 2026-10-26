/**
 * Chromium, Firefox and WebKit browser regressions at the real GitHub Pages base path.
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

async function prepare(browser, options = {}, { freshDevice = false } = {}) {
  // Keep API fixtures under Playwright's routing control. WebKit service-worker
  // networking can bypass those routes; exercise real workers separately below.
  const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 }, ...options });
  // Existing dashboard scenarios use a synthetic monitored player so the
  // new genuinely-empty guest state doesn't hide their expected match cards.
  await context.addInitScript(({ freshDevice }) => {
    if (freshDevice) return;
    const key = window.location.pathname.startsWith("/ballerwatch/beta/")
      ? "ballerwatch-beta-visitor-profile-v2" : "ballerwatch-visitor-profile-v2";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({
        schema: 2, data: { name: "Fixture Player", teams: ["Fixture FC"] },
      }));
    }
  }, { freshDevice });
  const calls = [];
  const errors = [];
  const controls = { offlineApi: false, optionalFailure: false, animationFailure: false, scriptFailure: false, noPickupCap: false, camelCaseTeam: false, mixedWatchSports: false, largeWatchHorizon: false };
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
      const fixture = structuredClone(fixtureResponse(url.pathname, request.method()));
      if (url.pathname === "/web/sports" && url.searchParams.has("teams")) {
        const at = new Date(Date.now() + 30 * 60 * 60 * 1000);
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles", year: "numeric",
          month: "2-digit", day: "2-digit",
        }).format(at);
        const isoDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(date) ? date :
          new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles", year: "numeric",
            month: "2-digit", day: "2-digit",
          }).formatToParts(at).filter(p=>["year","month","day"].includes(p.type))
            .reduce((acc,p)=>({...acc,[p.type]:p.value}),{});
        const day = typeof isoDate === "string" ? isoDate
          : [isoDate.year,isoDate.month,isoDate.day].join("-");
        fixture.games = ["Fixture Lakers vs Fixture Celtics",
          "Fixture Lakers vs Fixture Warriors",
          "Fixture Lakers vs Fixture Suns"].map((title,i) => ({
          id: "watch:nba:" + (i + 1), kind: "watch", sport: "basketball",
          competition: "NBA", title, date: day,
          startUtc: new Date(at.getTime() + (i === 2 ? 86400000 : i * 3600000)).toISOString(),
          endUtc: new Date(at.getTime() + (i === 2 ? 86400000 + 10800000 : (i + 3) * 3600000)).toISOString(),
          location: "Synthetic Arena",
          broadcasts: i === 0 ? ["Prime Video", "Peacock"] : i === 1 ? ["NBA TV"] : [],
          drogonChannels: i === 1 ? ["NBA TV"] : [],
        }));
        if (controls.mixedWatchSports) {
          fixture.games.push({
            id: "watch:eng.1:mixed", kind: "watch", sport: "soccer", date: day,
            competition: "Premier League", title: "Fixture Arsenal vs Fixture Chelsea",
            startUtc: new Date(at.getTime() + 1500000).toISOString(),
            endUtc: new Date(at.getTime() + 7200000).toISOString(),
            broadcasts: [],
          }, {
            id: "watch:nba:future", kind: "watch", sport: "basketball", date: day,
            competition: "NBA", title: "Fixture Lakers vs Fixture Future",
            startUtc: new Date(at.getTime() + 30 * 86400000).toISOString(),
            endUtc: new Date(at.getTime() + 30 * 86400000 + 7200000).toISOString(),
            broadcasts: [],
          });
        }
      }
        if (controls.largeWatchHorizon && url.pathname === "/web/sports" && fixture.games?.length) {
          // Hundreds of future fixtures must not create a year-wide GPU layer.
          for (let i = 2; i < 240; i++) {
            const nextDay = new Date(Date.parse(fixture.games[0].date + "T12:00:00Z") + i * 86400000)
              .toISOString().slice(0, 10);
            fixture.games.push({
              id: "watch:nba:stress-" + i, kind: "watch", sport: "basketball",
              competition: "NBA", title: "Fixture Lakers vs Fixture Team " + i,
              date: nextDay, startUtc: nextDay + "T19:00:00Z",
              endUtc: nextDay + "T21:00:00Z", location: "Synthetic Arena",
              broadcasts: [],
            });
          }
        }
      if (controls.noPickupCap && url.pathname === "/web/next-game") {
        fixture.game.capacity = null;
        fixture.game.publishedCapacity = null;
      }
      if (controls.noPickupCap && url.pathname === "/web/calendar") {
        for (const game of fixture.calendar.games) {
          if (game.kind === "pickup") {
            game.capacity = null;
            game.publishedCapacity = null;
          }
        }
      }
      if (controls.camelCaseTeam && url.pathname === "/web/calendar") {
        const game = fixture.calendar.games.find((match) => match.kind === "league");
        game.opponent = "PhoSaiGon";
        game.title = "Fixture FC vs PhoSaiGon";
      }
      if (controls.camelCaseTeam && url.pathname === "/web/standings") {
        fixture.standings.matchups.fixtureVsTest.opponent = "PhoSaiGon";
      }
      await route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(fixture) });
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

async function activateSpotlightControl(page, id) {
  const control = page.locator(id);
  // Headless Firefox sometimes exposes (hover: none), intentionally hiding
  // mouse-only edge affordances. Exercise their navigation handler without
  // demanding a hover-only control on a touch-oriented browser context.
  if (await control.isVisible()) await control.click();
  else await control.evaluate((element) => element.click());
}

async function ready(page, route = "") {
  await page.goto(`${origin}/ballerwatch/${route}`);
  try {
    await page.waitForFunction(() => document.querySelector("#next-game-title")?.textContent.includes("October 15"), null, { timeout: 10000 });
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
    const launchOptions = { headless: true, ...(engine === "chromium" ? {
      ...(shell ? {} : { channel: "chromium" }),
      args: ["--no-sandbox", "--disable-gpu", "--allow-insecure-localhost", "--ignore-certificate-errors", ...(shell ? ["--disable-blink-features=Badging"] : [])],
    } : {}) };
    const browser = await playwright[engine].launch(launchOptions);
    try {
      await scenario(`${engine}: all dashboard card footers have no divider line`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        await page.waitForSelector(".standings-slide .standings-card-footer");
        for (const viewport of [{ width: 1440, height: 1000 },
          { width: 390, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          const widths = await page.evaluate(() => [
            ".match-card-footer.bw-card-footer",
            ".standings-slide .standings-card-footer.bw-card-footer",
            ".calendar-card-footer.bw-card-footer",
          ].map((selector) => getComputedStyle(document.querySelector(selector)).borderTopWidth));
          assert.deepEqual(widths, ["0px", "0px", "0px"],
            "Match, standings and calendar credits should not have divider lines");
        }
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: profile chooser stays lightweight with a thousand indexed teams`, async () => {
        const { context, page, errors } = await prepare(browser, {
          reducedMotion: "reduce", viewport: { width: 390, height: 844 }, hasTouch: true,
        });
        await ready(page);
        const result = await page.evaluate(async () => {
          const { createSettingsChoice } = await import(new URL("lib/settings-choice.js", location.href).href);
          const root = document.createElement("div");
          root.innerHTML = `<button id="test-trigger"></button>
            <span id="test-display"></span><input id="test-value">
            <div id="test-panel" hidden><input id="test-search">
            <div id="test-options"></div></div>`;
          document.body.append(root);
          window.testProfileSaves = 0;
          const input = root.querySelector("#test-value");
          const panel = root.querySelector("#test-panel");
          const search = root.querySelector("#test-search");
          const options = root.querySelector("#test-options");
          const trigger = root.querySelector("#test-trigger");
          const select = createSettingsChoice({
            root, trigger, panel, search, optionsList: options,
            display: root.querySelector("#test-display"), input, multiple: false,
            onChange: () => { window.testProfileSaves += 1; },
          });
          const started = performance.now();
          select.setOptions(Array.from({ length: 1200 }, (_, i) => "Synthetic Team " + i));
          trigger.click();
          const firstPaint = performance.now() - started;
          const initialRows = options.children.length;
          search.value = "Synthetic Team 1199";
          search.dispatchEvent(new Event("input", { bubbles: true }));
          const matches = [...options.querySelectorAll('[role="option"]')]
            .map(option => option.textContent);
          const selected = options.querySelector('[role="option"]');
          selected.click();
          const immediate = input.value;
          const result = { initialRows, matches, immediate,
            firstPaint, expanded: trigger.getAttribute("aria-expanded") };
          root.remove();
          return result;
        });
        assert.ok(result.initialRows <= 36, "Do not mount huge option lists on phones");
        assert.ok(result.firstPaint < 1000, "Chooser should open without a multi-second task");
        assert.ok(result.matches.some(text => text.includes("Synthetic Team 1199")),
          "Search still reaches unloaded options");
        assert.equal(result.immediate, "Synthetic Team 1199");
        await page.waitForFunction(() => window.testProfileSaves === 1);
        assert.equal(await page.evaluate(() => window.testProfileSaves), 1,
          "Persist the selected value only once after feedback paints");
        assert.equal(result.expanded, "false", "Single selection closes the popover");
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: Play carousel and Watch daily carousel isolate matches and jump from schedule`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        assert.equal(await page.locator("#mode-play").getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator("#league-standings").isVisible(), true);
        await openHubTab(page, "settings");
        await page.locator("#watch-teams-trigger").click();
        await page.locator("#watch-teams-search").fill("Fixture Lakers");
        await page.locator('#watch-teams-options [role="option"]').first().click();
        await page.locator("#close-settings").click();
        await page.locator("#mode-watch").click();
        await page.locator("#watch-day-list .watch-day-card").first().waitFor();
        assert.equal(await page.locator("#mode-watch").getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator("#league-standings").isVisible(), false);
        assert.equal(await page.locator("#spotlight-carousel").isVisible(), false);
        assert.equal(await page.locator("#watch-day-list .watch-day-card").count(), 1);
        assert.equal(await page.locator("#watch-day-list .watch-match-row").count(), 2);
        assert.equal(await page.locator("#watch-day-list .watch-day-card[aria-hidden='false']").count(), 1);
        assert.equal(await page.locator("#watch-day-position").textContent(), "1 / 2 days");
        assert.match(await page.locator("#calendar-title").textContent(), /Watch Schedule/);
        assert.equal(await page.locator("#calendar-grid .calendar-signal-dot").count(), 3);
        await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").first().click();
        assert.equal(await page.locator("#watch-match-dialog").isVisible(), true);
        assert.equal(await page.locator("#watch-match-title").textContent(),
          "Fixture Lakers vs Fixture Celtics");
        assert.equal(await page.locator("#watch-match-competition").textContent(), "NBA");
        assert.match(await page.locator("#watch-match-channel").textContent(), /Prime Video/);
        assert.doesNotMatch(await page.locator("#watch-match-channel").textContent(), /Peacock/);
        await page.locator("#close-watch-match").click();
        await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").nth(1).click();
        assert.equal(await page.locator("#watch-match-title").textContent(),
          "Fixture Lakers vs Fixture Warriors");
        assert.equal(await page.locator("#watch-match-channel").textContent(), "NBA TV");
        await page.locator("#close-watch-match").click();
        await openHubTab(page, "settings");
        await page.locator("#watch-service-drogon").evaluate(element => {
          element.checked = false;
          element.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.locator("#close-settings").click();
        await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").nth(1).click();
        assert.equal(await page.locator("#watch-match-channel").textContent(), "");
        assert.equal(await page.locator("#watch-match-channel-row").isVisible(), false);
        await page.locator("#close-watch-match").click();
        await openHubTab(page, "settings");
        await page.locator("#watch-service-drogon").evaluate(element => {
          element.checked = true;
          element.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.locator("#close-settings").click();
        await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").nth(1).click();
        assert.equal(await page.locator("#watch-match-channel").textContent(), "NBA TV");
        await page.locator("#close-watch-match").click();
        await page.locator("#watch-next").click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "2 / 2 days");
        assert.equal(await page.locator("#watch-next").isDisabled(), true);
        assert.equal(await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").count(), 1);
        await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").click();
        assert.equal(await page.locator("#watch-match-title").textContent(),
          "Fixture Lakers vs Fixture Suns");
        assert.equal(await page.locator("#watch-match-channel").textContent(), "");
        assert.equal(await page.locator("#watch-match-channel-row").isVisible(), false);
        assert.match(await page.locator("#watch-match-time").textContent(), /[AP]M/);
        await page.locator("#close-watch-match").click();
        await page.locator('#calendar-grid .calendar-day[aria-disabled="false"]').first().click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "1 / 2 days");
        await page.locator("#watch-next").click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "2 / 2 days");
        await page.locator("#watch-previous").click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "1 / 2 days");
        await page.locator("#mode-play").click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-title")?.textContent.includes("October 15"));
        assert.equal(await page.locator("#league-standings").isVisible(), true);
        assert.equal(await page.locator("#mode-play").getAttribute("aria-pressed"), "true");
        assert.equal(await page.locator("#next-game-menu-trigger").isVisible(), true);
        assert.doesNotMatch(await page.locator("#next-game-title").textContent(), /Lakers/);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: Watch schedule shows both sports and day total stays fixed across long horizon`, async () => {
        const { context, page, errors, controls } = await prepare(browser, { reducedMotion: "reduce" });
        controls.mixedWatchSports = true;
        await ready(page);
        await openHubTab(page, "settings");
        await page.locator("#watch-teams-trigger").click();
        await page.locator("#watch-teams-search").fill("Fixture Lakers");
        await page.locator('#watch-teams-options [role="option"]').first().click();
        await page.locator("#close-settings").click();
        await page.locator("#mode-watch").click();
        await page.waitForFunction(() =>
          document.querySelector("#watch-day-position")?.textContent === "1 / 3 days" &&
          document.querySelectorAll("#watch-day-list .watch-day-card").length === 1);
        assert.equal(await page.locator("#watch-day-position").textContent(), "1 / 3 days");
        const firstDate = await page.locator("#watch-day-list .watch-day-card").first().getAttribute("data-watch-date");
        const icons = page.locator(`#calendar-grid .calendar-day[data-date="${firstDate}"] .calendar-watch-sports`);
        assert.equal(await icons.textContent(), "⚽ 🏀");
        assert.match(await page.locator(`#calendar-grid .calendar-day[data-date="${firstDate}"]`)
          .getAttribute("aria-label"), /soccer and basketball/);
        assert.equal(await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").count(), 3);
        await page.locator("#watch-next").click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "2 / 3 days");
        await page.locator("#watch-next").click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "3 / 3 days");
        const lastDate = await page.locator("#watch-day-list .watch-day-card").getAttribute("data-watch-date");
        assert.equal(await page.locator("#watch-next").isDisabled(), true);
        await page.locator("#watch-previous").click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "2 / 3 days");
        await page.locator("#two-week-calendar .calendar-heading").click();
        const lastDay = page.locator(`#calendar-grid .calendar-day[data-date="${lastDate}"]`);
        await lastDay.waitFor();
        await lastDay.click();
        assert.equal(await page.locator("#watch-day-position").textContent(), "3 / 3 days");
        assert.equal(await page.locator("#watch-day-list .watch-day-card[aria-hidden='false'] .watch-match-row").count(), 1);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: iPhone-sized Watch carousel keeps 240 dates without GPU-sized track`, async () => {
        // Keep this deliberately large GPU/memory regression in a separate
        // renderer, so it cannot destabilize unrelated later browser scenarios.
        const stressBrowser = await playwright[engine].launch(launchOptions);
        try {
          const { context, page, errors, controls } = await prepare(stressBrowser, {
            viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce",
          });
          controls.largeWatchHorizon = true;
          await ready(page);
          await openHubTab(page, "settings");
          await page.locator("#watch-teams-trigger").click();
          await page.locator("#watch-teams-search").fill("Fixture Lakers");
          await page.locator('#watch-teams-options [role="option"]').first().click();
          // Ordinary visitors see two months; the complete indexed horizon
          // is available as an explicit device-local setting.
          assert.equal(await page.locator("#watch-day-range").inputValue(), "2m");
          await page.locator("#watch-day-range").selectOption("max");
          await page.locator("#close-settings").click();
          await page.locator("#mode-watch").click();
          await page.waitForFunction(() =>
            Number((document.querySelector("#watch-day-position")?.textContent || "")
              .match(/^1 \/ (\d+) days$/)?.[1] || 0) > 1);
          const totalDays = Number((await page.locator("#watch-day-position").textContent())
            .match(/^1 \/ (\d+) days$/)?.[1] || 0);
          assert.ok(totalDays >= 200,
            `Expected a large Watch fixture index; rendered ${totalDays} days`);
          assert.equal(await page.locator("#watch-day-list .watch-day-card").count(), 1);
          const trackStyle = await page.locator("#watch-day-list").evaluate(element => ({
            transform: getComputedStyle(element).transform,
            willChange: getComputedStyle(element).willChange,
          }));
          assert.deepEqual(trackStyle, { transform: "none", willChange: "auto" });
          for (let i = 0; i < 24; i++) {
            await page.locator("#watch-next").click();
            assert.equal(await page.locator("#watch-day-list .watch-day-card").count(), 1);
          }
          assert.equal(await page.locator("#watch-day-position").textContent(), `25 / ${totalDays} days`);
          await page.locator("#watch-day-list .watch-match-row").first().click();
          assert.equal(await page.locator("#watch-match-dialog").isVisible(), true);
          await page.locator("#close-watch-match").click();
          for (let i = 0; i < 8; i++) await page.locator("#watch-previous").click();
          assert.equal(await page.locator("#watch-day-position").textContent(), `17 / ${totalDays} days`);
          assert.deepEqual(errors, []);
          await context.close();
        } finally {
          await stressBrowser.close();
        }
      });

      await scenario(`${engine}: Android install guidance, native prompt and mobile layout`, async () => {
        const { context, page, errors } = await prepare(browser, {
          viewport: { width: 412, height: 915 },
          hasTouch: true,
          ...(engine === "firefox" ? {} : { isMobile: true }),
          userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
          reducedMotion: "reduce",
        });
        await ready(page);
        assert.match(await page.locator("#install-copy").textContent(), /Android/);
        await page.locator("#install-help").click();
        assert.equal(await page.locator("#install-title").textContent(), "Install on Android");
        assert.equal(await page.locator('[data-install-guide="android"]').isVisible(), true);
        assert.equal(await page.locator('[data-install-guide="ios"]').isVisible(), false);
        assert.equal(await page.locator("#install-native").isVisible(), false);
        await page.locator('#install-dialog button[type="submit"]').click();
        await page.evaluate(() => {
          window.testNativeInstallCalls = 0;
          const install = new Event("beforeinstallprompt", { cancelable: true });
          install.prompt = async () => { window.testNativeInstallCalls += 1; };
          install.userChoice = Promise.resolve({ outcome: "accepted" });
          window.dispatchEvent(install);
          window.testInstallPrevented = install.defaultPrevented;
        });
        assert.equal(await page.evaluate(() => window.testInstallPrevented), true);
        await page.locator("#install-help").click();
        assert.equal(await page.locator("#install-native").isVisible(), true);
        await page.locator("#install-native").click();
        assert.equal(await page.evaluate(() => window.testNativeInstallCalls), 1);
        await page.locator('#install-dialog button[type="submit"]').click();
        for (const viewport of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
          await page.setViewportSize(viewport);
          assert.ok(await page.evaluate(() =>
            document.documentElement.scrollWidth <= window.innerWidth + 1), "Android layout must not overflow");
          assert.ok(await page.locator("#next-game-card").isVisible());
        }
        await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
        assert.equal(await page.locator("#install-card").count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: iPad desktop user agent shows Apple Home Screen instructions`, async () => {
        const { context, page, errors } = await prepare(browser, {
          viewport: { width: 820, height: 1180 }, hasTouch: true, reducedMotion: "reduce",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        });
        await context.addInitScript(() => {
          Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
          Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
        });
        await ready(page);
        await page.locator("#install-help").click();
        assert.equal(await page.locator("#install-title").textContent(), "Install on iPhone or iPad");
        assert.equal(await page.locator('[data-install-guide="ios"]').isVisible(), true);
        assert.equal(await page.locator('[data-install-guide="android"]').isVisible(), false);
        assert.deepEqual(errors, []);
        await context.close();
      });

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
        const inside = await page.evaluate(() => {
          const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -60 });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        });
        assert.equal(inside, false, "Backward movement inside the animation remains native");
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

      await scenario(`${engine}: backward scroll needs a deliberate pull but Skip and normal scrolling work`, async () => {
        const { context, page, errors } = await prepare(browser);
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        const state = await page.evaluate(() => {
          const intro = document.querySelector("#soccer-intro");
          const stage = document.querySelector("#soccer-stage");
          const boundary = intro.offsetHeight - stage.clientHeight;
          const emit = deltaY => {
            const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
            window.dispatchEvent(event);
            return { canceled: event.defaultPrevented, position: window.scrollY };
          };
          // Weak upward wheel motion stops at the main page boundary.
          const first = emit(-45);
          const second = emit(-60);
          const third = emit(-115);
          // Once rewinding, normal backward movement is not throttled.
          const withinIntro = emit(-40);
          window.scrollTo({ top: boundary + 180, behavior: "instant" });
          const normalMain = emit(-50);
          window.scrollTo({ top: boundary, behavior: "instant" });
          const normalDown = emit(50);
          return { boundary, first, second, third, withinIntro, normalMain, normalDown };
        });
        assert.ok(state.boundary > 100);
        assert.equal(state.first.canceled, true);
        assert.equal(state.second.canceled, true);
        assert.equal(state.first.position, state.boundary);
        assert.equal(state.second.position, state.boundary);
        assert.equal(state.third.canceled, true);
        assert.ok(state.third.position < state.boundary, "A firm pull should rewind");
        assert.equal(state.withinIntro.canceled, false, "Never throttle motion within the intro");
        assert.equal(state.normalMain.canceled, false, "Main feed scrolling must remain native");
        assert.equal(state.normalDown.canceled, false, "Downward scrolling is always free");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await page.locator("#soccer-intro").isVisible(), false);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: repeat-visit dashboard resists weak rewind and reopens on a firm pull`, async () => {
        const { context, page, errors } = await prepare(browser);
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
        assert.equal(await page.locator("#soccer-intro").isVisible(), false);
        const result = await page.evaluate(() => {
          const gesture = (deltaY) => {
            const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
            window.dispatchEvent(event);
            return {
              canceled: event.defaultPrevented,
              cinematic: document.documentElement.classList.contains("v2-cinematic"),
              y: scrollY,
              resisted: document.documentElement.classList.contains("v2-rewind-resisting"),
            };
          };
          const first = gesture(-45);
          const second = gesture(-65);
          const third = gesture(-115);
          const stage = document.querySelector("#soccer-stage");
          const distance = document.querySelector("#soccer-intro").offsetHeight - stage.clientHeight;
          return { first, second, third, distance };
        });
        assert.equal(result.first.canceled, true);
        assert.equal(result.first.cinematic, false);
        assert.equal(result.first.resisted, true);
        assert.equal(result.second.cinematic, false);
        assert.equal(result.third.cinematic, true);
        assert.ok(result.third.y < result.distance);
        await page.waitForFunction(() => Number(document.documentElement.dataset.sceneProgress) < 1);
        const timelineCopy = await page.locator("#scene-description").textContent();
        assert.match(timelineCopy, /Vela TV|NBA and world football/);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: a short upward gesture visibly stretches dashboard before rewinding`, async () => {
        const { context, page, errors } = await prepare(browser);
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
        const before = await page.locator("#matchday-app").boundingBox();
        const state = await page.evaluate(() => {
          const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -70 });
          window.dispatchEvent(event);
          const root = document.documentElement;
          const indicator = document.querySelector("#rewind-affordance");
          return {
            prevented: event.defaultPrevented,
            hint: indicator.textContent,
            visible: getComputedStyle(indicator).visibility,
            tension: Number.parseFloat(root.style.getPropertyValue("--rewind-tension")),
            progress: Number(root.style.getPropertyValue("--rewind-progress")),
            cinematic: root.classList.contains("v2-cinematic"),
          };
        });
        assert.equal(state.prevented, true);
        assert.equal(state.visible, "visible");
        assert.match(state.hint, /Pull to rewind/);
        assert.ok(state.tension >= 12);
        assert.ok(state.progress > 0 && state.progress < 1);
        assert.equal(state.cinematic, false);
        await page.waitForTimeout(130);
        const after = await page.locator("#matchday-app").boundingBox();
        assert.ok(after.y - before.y >= 8, "The whole dashboard must resist, not only its title");
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-rewind-resisting"));
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: touch pull must overcome a fresh threshold from an already-open dashboard`, async () => {
        const { context, page, errors } = await prepare(browser, {
          viewport: { width: 390, height: 844 }, hasTouch: true,
          ...(engine === "firefox" ? {} : { isMobile: true }),
        });
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
        const result = await page.evaluate(() => {
          const target = document.querySelector("#matchday-app");
          // WebKit desktop prohibits Touch/TouchEvent constructors even with
          // a touch-enabled context. DOM dispatch still exercises the actual
          // listener and its cancelable touch payload on every engine.
          const touch = y => ({ identifier: 1, target, clientX: 120, clientY: y });
          function send(type, y) {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, {
              touches: { value: type === "touchend" ? [] : [touch(y)] },
              targetTouches: { value: type === "touchend" ? [] : [touch(y)] },
              changedTouches: { value: [touch(y)] },
            });
            target.dispatchEvent(event);
            return { prevented: event.defaultPrevented,
              cinematic: document.documentElement.classList.contains("v2-cinematic") };
          }
          const first = send("touchstart", 80);
          const short = send("touchmove", 130);
          const firm = send("touchmove", 260);
          send("touchend", 260);
          return { first, short, firm };
        });
        assert.equal(result.short.prevented, true);
        assert.equal(result.short.cinematic, false);
        assert.equal(result.firm.prevented, true);
        assert.equal(result.firm.cinematic, true);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: a swipe reaching the dashboard edge resists and then rewinds`, async () => {
        const { context, page, errors } = await prepare(browser, {
          viewport: { width: 390, height: 844 }, hasTouch: true,
          ...(engine === "firefox" ? {} : { isMobile: true }),
        });
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        const state = await page.evaluate(() => {
          const target = document.querySelector("#matchday-app");
          const intro = document.querySelector("#soccer-intro");
          const stage = document.querySelector("#soccer-stage");
          const boundary = intro.offsetHeight - stage.clientHeight;
          window.scrollTo({ top: boundary + 125, behavior: "instant" });
          const emit = (type, y, x = 110, cancelable = true) => {
            const touch = { identifier: 3, target, clientX: x, clientY: y };
            const event = new Event(type, { bubbles: true, cancelable });
            Object.defineProperties(event, {
              touches: { value: type === "touchend" ? [] : [touch] },
              changedTouches: { value: [touch] },
            });
            target.dispatchEvent(event);
            return { prevented: event.defaultPrevented,
              tension: document.documentElement.classList.contains("v2-rewind-resisting"),
              cinematic: document.documentElement.classList.contains("v2-cinematic") };
          };
          emit("touchstart", 90);
          const below = emit("touchmove", 140);
          window.scrollTo({ top: boundary + 4, behavior: "instant" });
          const edge = emit("touchmove", 210);
          const hard = emit("touchmove", 380);
          emit("touchend", 380);
          return { below, edge, hard, boundary, position: window.scrollY };
        });
        assert.equal(state.below.prevented, false, "Main feed should scroll naturally");
        assert.equal(state.edge.prevented, true, "Crossing the top boundary should engage resistance");
        assert.equal(state.edge.tension, true, "Resistance should be visible");
        assert.equal(state.hard.cinematic, true, "A continuous firm pull opens the intro");
        assert.ok(state.position < state.boundary);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: horizontal swipes and uncancelable Safari touch events stay safe`, async () => {
        const { context, page, errors } = await prepare(browser, {
          viewport: { width: 390, height: 844 }, hasTouch: true,
          ...(engine === "firefox" ? {} : { isMobile: true }),
        });
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        await page.reload();
        await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
        const state = await page.evaluate(() => {
          const target = document.querySelector("#matchday-app");
          const emit = (type, x, y, cancelable = true) => {
            const touch = { identifier: 4, target, clientX: x, clientY: y };
            const event = new Event(type, { bubbles: true, cancelable });
            Object.defineProperties(event, {
              touches: { value: type === "touchend" ? [] : [touch] },
              changedTouches: { value: [touch] },
            });
            target.dispatchEvent(event);
            return { prevented: event.defaultPrevented,
              tension: document.documentElement.classList.contains("v2-rewind-resisting"),
              cinematic: document.documentElement.classList.contains("v2-cinematic") };
          };
          emit("touchstart", 50, 100);
          const horizontal = emit("touchmove", 200, 110);
          const diagonal = emit("touchmove", 210, 340);
          emit("touchend", 210, 340);
          emit("touchstart", 100, 100);
          const safari = emit("touchmove", 100, 160, false);
          const resisted = document.documentElement.classList.contains("v2-rewind-resisting");
          const strong = emit("touchmove", 100, 290, false);
          emit("touchend", 100, 290);
          return { horizontal, diagonal, safari, resisted, strong };
        });
        assert.equal(state.horizontal.prevented, false);
        assert.equal(state.diagonal.prevented, false);
        assert.equal(state.diagonal.cinematic, false);
        assert.equal(state.safari.prevented, false, "Uncancelable Safari events cannot be prevented");
        assert.equal(state.resisted, true, "Safari still gets tactile boundary feedback");
        assert.equal(state.strong.cinematic, true, "Safari firm pull must rewind");
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: a small downward scroll followed by upward wheels still resists the intro`, async () => {
        const { context, page, errors } = await prepare(browser);
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        const state = await page.evaluate(async () => {
          const intro = document.querySelector("#soccer-intro");
          const stage = document.querySelector("#soccer-stage");
          const boundary = intro.offsetHeight - stage.clientHeight;
          const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
          window.scrollTo({top:boundary+110,behavior:"instant"});
          await tick();
          const wheel = dy => {
            const event = new WheelEvent("wheel", {bubbles:true,cancelable:true,deltaY:dy});
            window.dispatchEvent(event);
            return {canceled:event.defaultPrevented,scroll:window.scrollY,
              resisted:document.documentElement.classList.contains("v2-rewind-resisting")};
          };
          const free = wheel(-60);
          // The browser normally scrolls the feed before reaching its edge.
          window.scrollTo({top:boundary+12,behavior:"instant"});
          await tick();
          const edge = wheel(-65);
          const firm = wheel(-200);
          return {free,edge,firm,boundary,
            cinematic:document.documentElement.classList.contains("v2-cinematic")};
        });
        assert.equal(state.free.canceled, false, "Down-page movement remains native");
        assert.equal(state.edge.canceled, true, "Crossing the dashboard edge must be intercepted");
        assert.equal(state.edge.resisted, true, "Crossing edge must visibly resist");
        assert.equal(state.firm.canceled, true);
        assert.equal(state.cinematic, true);
        assert.ok(state.firm.scroll < state.boundary);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: a long upward touch starting below the edge still resists`, async () => {
        const {context,page,errors} = await prepare(browser, {
          viewport:{width:390,height:844},hasTouch:true,
          ...(engine === "firefox" ? {} : {isMobile:true}),
        });
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        await page.locator("#skip-intro").click();
        const state = await page.evaluate(() => {
          const target=document.querySelector("#matchday-app");
          const stage=document.querySelector("#soccer-stage");
          const boundary=document.querySelector("#soccer-intro").offsetHeight-stage.clientHeight;
          window.scrollTo({top:boundary+130,behavior:"instant"});
          const send=(type,y,cancelable=true)=>{
            const touch={identifier:2,target,clientX:100,clientY:y};
            const event=new Event(type,{bubbles:true,cancelable});
            Object.defineProperties(event,{
              touches:{value:type==="touchend"?[]:[touch]},
              changedTouches:{value:[touch]},
            });
            target.dispatchEvent(event);
            return {canceled:event.defaultPrevented,
              resisting:document.documentElement.classList.contains("v2-rewind-resisting"),
              cinematic:document.documentElement.classList.contains("v2-cinematic")};
          };
          send("touchstart",100);
          const inside=send("touchmove",155);
          window.scrollTo({top:boundary+8,behavior:"instant"});
          const crossed=send("touchmove",235,false);
          const firm=send("touchmove",390,false);
          send("touchend",390);
          return {inside,crossed,firm,boundary,position:window.scrollY};
        });
        assert.equal(state.inside.canceled,false);
        assert.equal(state.crossed.canceled,false,"Safari can mark mid-swipe touch uncancelable");
        assert.equal(state.crossed.resisting,true,"The partial drag still shows resistance");
        assert.equal(state.firm.cinematic,true,"Continuing the same swipe reopens intro");
        assert.ok(state.position < state.boundary);
        assert.deepEqual(errors,[]);
        await context.close();
      });

      await scenario(`${engine}: feature tour keeps Settings and Inbox tappable during the reveal`, async () => {
        const { context, page, errors } = await prepare(browser);
        await ready(page);
        await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
        for (const [progress, text] of [[.05, "NBA and world football"], [.2, "waitlists"], [.4, "ten-game scouting"],
          [.55, "contextual follow-ups"], [.7, "Web Push"], [.85, "Vela TV calendar subscriptions"]]) {
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
          viewport: { width: 390, height: 560 }, hasTouch: true,
          ...(engine === "firefox" ? {} : { isMobile: true }),
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
          assert.equal(coverage.background, "rgb(13, 18, 27)");
          assert.equal(coverage.opacity, "1");
          assert.equal(coverage.views[0], coverage.views[1]);
          assert.equal(coverage.cameras[0], coverage.cameras[1]);
        }
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: legacy V2 links converge on beta and notification checks sit beside text`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await context.addInitScript(() => localStorage.setItem("ballerwatch-visitor-profile-v1-24h", JSON.stringify({ schema:1, expiresAt:Date.now()+86_400_000, data:{ name:"Sample visitor", teams:[] } })));
        await ready(page, "v2/?from=legacy#matches");
        assert.equal(new URL(page.url()).pathname, "/ballerwatch/beta/");
        assert.equal(new URL(page.url()).search, "?from=legacy");
        assert.equal(new URL(page.url()).hash, "#matches");
        await openHubTab(page, "settings");
        // Explicit test fixture is seeded in Beta independently of the legacy
        // production-only profile. The legacy data must remain untouched.
        assert.equal(await page.locator("#guest-name").inputValue(), "Fixture Player");
        assert.ok(await page.evaluate(() => localStorage.getItem("ballerwatch-visitor-profile-v1-24h")),
          "legacy production identity must not be migrated or erased by beta");
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

      await scenario(`${engine}: three-way forecast aligns win, tie, opponent and a borderless shared track`, async () => {
        const { context, page, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page);
        await activateSpotlightControl(page, "#spotlight-next");
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
        assert.equal(await page.locator("#next-game-form .win-chance-labels").evaluate((element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length), 2);
        assert.match(appearance.aria, /Fixture FC win 45%, draw 20%, Test United win 35%/);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: CamelCase team names use capitalized-word abbreviations`, async () => {
        const { context, page, controls, errors } = await prepare(browser, { reducedMotion: "reduce" });
        controls.camelCaseTeam = true;
        await ready(page);
        await activateSpotlightControl(page, "#spotlight-next");
        await page.waitForFunction(() => document.querySelector("#next-game-form")?.textContent.includes("PSG 35%"));
        assert.deepEqual(await page.locator("#next-game-form .win-chance-labels span").allTextContents(),
          ["FFC 45%", "PSG 35%"]);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: first-device wizard chooses personal settings without an account`, async () => {
        const { context, page, errors } = await prepare(browser,
          { reducedMotion: "reduce" }, { freshDevice: true });
        await page.goto(`${origin}/ballerwatch/`);
        await page.locator("#first-run-dialog[open]").waitFor();
        assert.equal(await page.locator("#setup-progress").textContent(), "STEP 1 OF 3");
        await page.locator("#setup-name-trigger").click();
        await page.locator("#setup-name-search").fill("Fixture Player");
        await page.locator('#setup-name-options [role="option"]').filter({ hasText: "Fixture Player" }).first().click();
        await page.locator("#setup-next").click();
        assert.equal(await page.locator("#setup-progress").textContent(), "STEP 2 OF 3");
        await page.locator("#setup-teams-trigger").click();
        await page.locator("#setup-teams-search").fill("Fixture FC");
        await page.locator('#setup-teams-options [role="option"]').filter({ hasText: "Fixture FC" }).first().click();
        await page.locator("#setup-next").click();
        assert.equal(await page.locator("#setup-progress").textContent(), "STEP 3 OF 3");
        await page.locator("#setup-watch-trigger").click();
        await page.locator("#setup-watch-search").fill("Fixture Lakers");
        await page.locator('#setup-watch-options [role="option"]').filter({ hasText: "NBA · Fixture Lakers" }).waitFor();
        await page.locator('#setup-watch-options [role="option"]').filter({ hasText: "NBA · Fixture Lakers" }).click();
        await page.locator("#setup-next").click();
        assert.equal(await page.locator("#first-run-dialog").evaluate(el => el.open), false);
        const saved = await page.evaluate(() => ({
          profile: JSON.parse(localStorage.getItem("ballerwatch-visitor-profile-v2")).data,
          watch: JSON.parse(localStorage.getItem("ballerwatch-watched-teams-v1")),
          done: localStorage.getItem("ballerwatch-first-run-v1"),
        }));
        assert.equal(saved.profile.name, "Fixture Player");
        assert.deepEqual(saved.profile.teams, ["Fixture FC"]);
        assert.deepEqual(saved.watch, ["NBA · Fixture Lakers"]);
        assert.equal(saved.done, "complete");
        await page.reload();
        assert.equal(await page.locator("#first-run-dialog").evaluate(el => el.open), false);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: first-device setup is skippable and explains missing preferences`, async () => {
        const { context, page, errors } = await prepare(browser,
          { reducedMotion: "reduce" }, { freshDevice: true });
        await page.goto(`${origin}/ballerwatch/`);
        await page.locator("#first-run-dialog[open]").waitFor();
        await page.locator("#setup-skip").click();
        await page.locator("#setup-skip").click();
        await page.locator("#setup-skip").click();
        assert.equal(await page.locator("#first-run-dialog").evaluate(el => el.open), false);
        assert.equal(await page.locator("#setup-missing-note").isVisible(), true);
        assert.match(await page.locator("#setup-missing-text").textContent(), /No Play preferences yet/);
        await page.locator("#setup-open-settings").click();
        assert.equal(await page.locator("#settings-dialog").evaluate(el => el.open), true);
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
        await page.locator("#guest-name-trigger").click();
        await page.locator("#guest-name-search").fill("Visitor");
        await page.locator('#guest-name-options [role="option"]').filter({ hasText: "Visitor" }).first().click();
        await page.locator("#guest-teams-trigger").click();
        assert.match(await page.locator("#guest-teams-display").textContent(), /1 team selected/);
        await page.locator("#guest-teams-search").fill("Test United");
        await page.locator('#guest-teams-options [role="option"]').first().click();
        await page.waitForFunction(() => {
          const raw = localStorage.getItem("ballerwatch-visitor-profile-v2");
          if (!raw) return false;
          const profile = JSON.parse(raw).data;
          return profile.name === "Visitor" &&
            profile.teams.includes("Fixture FC") && profile.teams.includes("Test United");
        });
        await page.waitForFunction(() =>
          document.querySelector("#guest-settings-status")?.textContent.startsWith("Saved."));
        const profile = await page.evaluate(() => JSON.parse(localStorage.getItem("ballerwatch-visitor-profile-v2")).data);
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
          JSON.parse(localStorage.getItem("ballerwatch-notification-channels-v2")).channels.pickup), false);
        await page.reload();
        await ready(page);
        await openHubTab(page, "settings");
        assert.equal(await page.locator("#guest-name").inputValue(), "Visitor");
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: local match edits and hides survive reload without altering other devices`, async () => {
        const first = await prepare(browser, {reducedMotion:"reduce"});
        const {page,calls,errors}=first;
        await ready(page);
        await page.locator("#next-game-menu-trigger").click();
        await page.locator("#next-game-menu-edit").click();
        await page.locator("#match-override-date").fill("2099-10-16");
        await page.locator("#match-override-start").fill("20:30");
        await page.locator("#match-override-end").fill("22:30");
        await page.locator("#match-override-location").fill("My Private Fixture Field");
        await page.locator('#match-override-form button[type="submit"]').click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("My Private Fixture Field"));
        assert.ok(await page.evaluate(()=>Boolean(localStorage.getItem("ballerwatch:local-match-edits:v1"))));
        await page.reload();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("My Private Fixture Field"));
        page.once("dialog", dialog=>dialog.accept());
        await page.locator("#next-game-menu-trigger").click();
        await page.locator("#next-game-menu-delete").click();
        await page.waitForFunction(() =>
          !document.querySelector("#next-game-location")?.textContent.includes("My Private Fixture Field"));
        await openHubTab(page,"settings");
        assert.equal(await page.locator("#deleted-match-management").isVisible(),true);
        await page.locator("#deleted-match-list [data-restore-match-id]").click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("My Private Fixture Field"));
        await page.locator("#close-settings").click();
        assert.equal(calls.some(call => call.path.startsWith("/web/user/match") &&
          call.method!=="GET"),false,"device edits never post shared mutations");
        assert.deepEqual(errors,[]);
        await first.context.close();
        const second=await prepare(browser,{reducedMotion:"reduce"});
        await ready(second.page);
        assert.match(await second.page.locator("#next-game-location").textContent(),
          /Fixture Park Soccer/);
        assert.deepEqual(second.errors,[]);
        await second.context.close();
      });

      await scenario(`${engine}: beta match edits need no login and never alter production preferences`, async () => {
        const { context, page, calls, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page, "beta/");
        assert.equal(new URL(page.url()).pathname, "/ballerwatch/beta/");
        await page.locator("#next-game-menu-trigger").click();
        await page.locator("#next-game-menu-edit").click();
        await page.locator("#match-override-location").fill("Beta-only Fixture Field");
        await page.locator('#match-override-form button[type="submit"]').click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("Beta-only Fixture Field"));
        assert.equal(await page.evaluate(() =>
          Boolean(localStorage.getItem("ballerwatch:beta:local-match-edits:v1"))), true);
        assert.equal(await page.evaluate(() =>
          localStorage.getItem("ballerwatch:local-match-edits:v1")), null);
        await page.goto(`${origin}/ballerwatch/`);
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("Fixture Park Soccer"));
        assert.match(await page.locator("#next-game-location").textContent(), /Fixture Park Soccer/);
        await page.goto(`${origin}/ballerwatch/beta/`);
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("Beta-only Fixture Field"));
        page.once("dialog", (dialog) => dialog.accept());
        await page.locator("#next-game-menu-trigger").click();
        await page.locator("#next-game-menu-delete").click();
        await openHubTab(page, "settings");
        await page.locator("#deleted-match-list [data-restore-match-id]").click();
        await page.locator("#close-settings").click();
        await page.waitForFunction(() =>
          document.querySelector("#next-game-location")?.textContent.includes("Beta-only Fixture Field"));
        assert.equal(calls.some(call => call.path.startsWith("/web/user/match") &&
          call.method !== "GET"), false);
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
        await activateSpotlightControl(page, "#spotlight-next");
        await page.waitForFunction(() =>
          document.querySelector("#next-game-meta")?.textContent.includes("Fixture FC vs Second FC"));
        await activateSpotlightControl(page, "#spotlight-previous");
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
        const { context, page, errors } = await prepare(browser, { ...(engine === "firefox"
          ? { viewport: { width: 390, height: 844 }, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }
          : { ...playwright.devices["iPhone 13"], defaultBrowserType: undefined }) });
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
        const reduced = await prepare(browser, { ...(engine === "firefox"
          ? { viewport: { width: 390, height: 844 }, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }
          : playwright.devices["iPhone 13"]), reducedMotion: "reduce" });
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

      await scenario(`${engine}: missing RSVP cap is hidden in match and roster while internal alerts use 16`, async () => {
        const { context, page, controls, errors } = await prepare(browser, { reducedMotion: "reduce" });
        controls.noPickupCap = true;
        await ready(page);
        assert.equal(await page.locator("#next-game-capacity-label").textContent(), "12 reserved");
        assert.equal(await page.locator("#next-game-capacity-spots").textContent(), "");
        assert.equal(await page.locator("#next-game-capacity .next-game-capacity-track").isVisible(), false);
        await page.locator("#next-game-capacity").click();
        await page.waitForSelector("#rsvp-roster-confirmed-list li");
        assert.match(await page.locator("#rsvp-roster-summary").textContent(), /^1 spot reserved · RSVP order$/);
        assert.deepEqual(errors, []);
        await context.close();
      });

      await scenario(`${engine}: guest roster access and session-only maintenance unlock`, async () => {
        const { context, page, calls, errors } = await prepare(browser, { reducedMotion: "reduce" });
        await ready(page, "");
        await page.locator("#next-game-capacity").click();
        await page.waitForSelector("#rsvp-roster-confirmed-list li");
        assert.match(await page.locator("#rsvp-roster-confirmed-list").textContent(), /Fixture Player/);
        assert.ok(calls.some((call) => call.path === "/web/rsvp-roster" && !call.authorization));
        await page.locator("#close-rsvp-roster").click();
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
        assert.ok(calls.filter((call) => call.path === "/web/rsvp-roster").every((call) => !call.authorization));
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
        await instance.page.waitForFunction(() => document.querySelector("#next-game-title")?.textContent.includes("October 15"));
        // One transient outage is not enough to label saved fixtures stale:
        // the last-good schedule stays visible with an honest neutral status.
        await instance.page.waitForFunction(() => document.querySelector("#system-status").textContent === "Ready");
        assert.equal(await instance.page.locator("#system-status").textContent(), "Ready");
        assert.match(await instance.page.locator("#calendar-updated").textContent(), /Updated/);
        await instance.context.close();
      });

      if (engine === "chromium") {
        await scenario("chromium: legacy installed worker redirects to beta offline without changing production caches", async () => {
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
          assert.equal(new URL(page.url()).pathname, "/ballerwatch/beta/");
          await alignSyntheticCalendarCacheToToday(page);
          await context.unrouteAll({ behavior: "wait" });
          await context.setOffline(true);
          await page.goto(`${origin}/ballerwatch/v2/`, { waitUntil: "domcontentloaded" });
          assert.equal(new URL(page.url()).pathname, "/ballerwatch/beta/");
          // Offline entry must return to beta with its real app shell. A restored
          // fixture may use the shorter date label while the cache refreshes.
          await page.waitForFunction(() =>
            document.querySelector("#matchday-app") &&
            document.querySelector("#next-game-card") &&
            !document.querySelector("#matchday-app").inert,
          null, { timeout: 8000 });
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

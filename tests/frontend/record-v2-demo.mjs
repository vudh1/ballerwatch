/**
 * Record the canonical deployed/local UI with synthetic APIs into the README GIF.
 * Baseline: v8.14.0. Deployed/local assets; every API request is synthetic.
 * No production accounts, messages, notifications, RSVP or Calendar writes.
 */
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fixtureResponse } from "./browser-fixtures.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BALLERWATCH_PLAYWRIGHT_MODULE || "playwright");
const source = path.resolve(process.env.BALLERWATCH_WEB_ROOT || "frontend/web");
const output = path.resolve(process.env.BALLERWATCH_DEMO_OUTPUT || "docs/demo.gif");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ballerwatch-v2-demo-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${temporary}/key.pem`,
  "-out", `${temporary}/cert.pem`, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-days", "1"], { stdio: "ignore" });
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = https.createServer({ key: fs.readFileSync(`${temporary}/key.pem`), cert: fs.readFileSync(`${temporary}/cert.pem`) }, (request, response) => {
  const url = new URL(request.url, "https://localhost");
  const relative = decodeURIComponent(url.pathname.replace(/^\/ballerwatch\//, ""));
  let file = path.resolve(source, relative);
  if (!file.startsWith(`${source}/`) || !url.pathname.startsWith("/ballerwatch/")) { response.writeHead(404).end(); return; }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const remoteOrigin = process.env.BALLERWATCH_DEMO_ORIGIN || "";
const origin = remoteOrigin || `https://127.0.0.1:${server.address().port}`;
if (remoteOrigin && remoteOrigin !== "https://vudh1.github.io") throw new Error("Unsupported production demo origin");
const browser = await chromium.launch({ headless: true, ...(remoteOrigin && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}), args: ["--no-sandbox", "--disable-gpu", "--ignore-certificate-errors"] });
try {
  const context = await browser.newContext({ viewport: { width: 480, height: 890 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, serviceWorkers: "block",
    recordVideo: { dir: path.join(temporary, "video"), size: { width: 480, height: 890 } } });
  const productionAssets = new Map();
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "ballerwatch-web.vudhone.workers.dev") {
      const headers = { "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      const data = url.pathname === "/web/ask" ? { ok: true,
        reply: "Your next league game is Sunday, October 18 at 10 AM. Wear white. Directions and field sharing are on the match card." }
        : fixtureResponse(url.pathname, request.method());
      await route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(data) });
    } else if (url.origin === origin && request.method() === "GET") {
      if (!remoteOrigin) { await route.continue(); return; }
      if (!productionAssets.has(url.href)) {
        const response = await route.fetch();
        if (!response.ok()) throw new Error(`Production asset failed: ${url.pathname}`);
        const headers = response.headers();
        for (const name of ["content-encoding", "content-length", "transfer-encoding"]) delete headers[name];
        productionAssets.set(url.href, { status: response.status(), headers, body: await response.body() });
      }
      await route.fulfill(productionAssets.get(url.href));
    } else await route.abort();
  });
  if (remoteOrigin) {
    const warmup = await context.newPage();
    await warmup.goto(`${origin}/ballerwatch/`);
    await warmup.waitForFunction(() => document.documentElement.dataset.timelineReady === "true");
    await warmup.close();
  }
  // A fresh page gets its own native video and session-only launch state.
  // Reuse exact production bytes, avoiding network latency in the opening.
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  console.log("Recording branded launch and feature tour…");
  await page.goto(`${origin}/ballerwatch/`);
  await page.waitForFunction(() => document.documentElement.dataset.timelineReady === "true" &&
    document.querySelector("#next-game-title").textContent.includes("October 15"));
  await page.waitForFunction(() => !document.documentElement.classList.contains("v2-launching"));
  await page.waitForTimeout(500);
  const tour = await page.evaluate(async () => {
    let frames = 0;
    const distance = document.querySelector("#soccer-intro").offsetHeight - document.querySelector("#soccer-stage").clientHeight;
    const start = performance.now();
    await new Promise((resolve) => {
      const move = () => {
        frames += 1;
        const progress = Math.min(1, (performance.now() - start) / 15000);
        window.scrollTo(0, distance * progress);
        if (progress < 1) requestAnimationFrame(move);
        else resolve();
      };
      requestAnimationFrame(move);
    });
    return { frames, seconds: (performance.now() - start) / 1000 };
  });
  console.log(`Native tour animation: ${(tour.frames / tour.seconds).toFixed(1)} frames/sec`);
  await page.waitForTimeout(1800);
  console.log("Recording match cards, calendar and standings…");
  const card = await page.locator("#next-game-card").boundingBox();
  const touch = await context.newCDPSession(page);
  const y = card.y + 125;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 395, y, id: 1 }] });
  for (let step = 1; step <= 16; step += 1) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 395 - step * 18, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touch.detach();
  await page.waitForFunction(() => document.querySelector("#next-game-meta").textContent.includes("Fixture FC"));
  await page.waitForTimeout(1700);
  await page.locator("#two-week-calendar").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  await page.waitForTimeout(1600);
  await page.locator("#league-standings").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  await page.waitForTimeout(2000);
  console.log("Recording AI, Inbox and personal settings…");
  await page.locator("#chat-launcher").click();
  await page.locator("#question").fill("What jersey color for our next league game?");
  await page.locator('#question-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector("#answer").textContent.includes("Wear white"));
  await page.waitForTimeout(2200);
  await page.locator("#close-chat").click();
  await page.locator("#chat-launcher").click();
  await page.locator("#notification-bell").click();
  await page.waitForTimeout(1900);
  await page.locator("#close-notifications").click();
  await page.locator("#chat-launcher").click();
  await page.locator("#settings-button").click();
  await page.waitForTimeout(2300);
  if (errors.length) throw new Error(`Demo browser errors: ${errors.join(", ")}`);
  await context.close();
  const videoPath = await video.path();
  if (process.env.BALLERWATCH_DEMO_VIDEO) fs.copyFileSync(videoPath, path.resolve(process.env.BALLERWATCH_DEMO_VIDEO));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  // Separate palette generation keeps the encoder from buffering the whole
  // movie in memory; gentle denoising removes native-video compression noise.
  const filters = "fps=20,scale=420:-1:flags=lanczos,hqdn3d=1.5:1.5:2:2";
  const palette = path.join(temporary, "palette.png");
  execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-y", "-i", videoPath, "-vf",
    `${filters},palettegen=max_colors=64:stats_mode=diff`, "-frames:v", "1", palette], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-v", "error", "-threads", "1", "-y", "-i", videoPath, "-i", palette, "-lavfi",
    `[0:v]${filters}[v];[v][1:v]paletteuse=dither=none:diff_mode=rectangle`, "-loop", "0", output], { stdio: "ignore" });
  if (process.env.BALLERWATCH_GIFSICLE) {
    execFileSync(process.env.BALLERWATCH_GIFSICLE, ["-O3", "--lossy=40", "--careful", "-b", output], { stdio: "ignore" });
    if (fs.statSync(output).size > 10_000_000) {
      execFileSync(process.env.BALLERWATCH_GIFSICLE, ["-O3", "--lossy=60", "--careful", "-b", output], { stdio: "ignore" });
    }
  }
  if (fs.statSync(output).size > 10_000_000) throw new Error("README GIF exceeds 10 MB; configure BALLERWATCH_GIFSICLE or shorten the tour.");
  console.log(`BallerWatch demo recorded: ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MiB)`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}

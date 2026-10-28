/**
 * FRIDAY Quiet Glass presentation contract; synthetic, no API requests or state writes.
 * Baseline: v11.13.0. Keep iOS-friendly CSS and PWA offline versioning aligned.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("frontend/web/v2/styles.css", "utf8");
const html = fs.readFileSync("frontend/web/index.html", "utf8");
const sw = fs.readFileSync("frontend/web/sw.js", "utf8");
const manifest = fs.readFileSync("frontend/web/manifest.webmanifest", "utf8");

test("matchday semantic colors mirror FRIDAY v1 without runtime imports", () => {
  for (const [token, color] of Object.entries({
    "--friday-canvas": "#0D121B",
    "--friday-surface-base": "#18212E",
    "--friday-surface-raised": "#243143",
    "--friday-text-primary": "#F4F6FA",
    "--friday-text-secondary": "#ADB7C5",
    "--friday-border-subtle": "#3C4B5D",
    "--friday-focus-ring": "#BCEAFF",
    "--friday-ballerwatch-sky": "#68CFF7"
  })) {
    assert.ok(css.includes(`${token}: ${color};`), token);
  }
  assert.match(css, /--v2-night: var\(--friday-canvas\)/);
  assert.doesNotMatch(css, /@import\s+url\(/);
});

test("mode, watch, hub and reduced motion remain accessible and lightweight", () => {
  assert.match(html, /id="mode-play"[\s\S]*?aria-pressed="true">Playing<\/button>/);
  assert.match(html, /id="mode-watch"[\s\S]*?aria-pressed="false">Watching<\/button>/);
  for (const id of ["watch-day-viewport", "watch-day-list", "watch-match-dialog",
    "chat-launcher", "settings-button", "notification-bell", "skip-intro"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  const layer = css.slice(css.indexOf("FRIDAY Quiet Glass v1, review candidate"));
  assert.match(layer, /\.v2 \.match-mode-track[\s\S]*?backdrop-filter: none;/);
  assert.match(layer, /\.v2 \.watch-day-card[\s\S]*?backdrop-filter: none;/);
  assert.match(layer, /\.v2 \.app-hub-tabs button[\s\S]*?min-height: 44px;/);
  assert.match(layer, /@media \(max-width: 430px\)/);
  assert.match(layer, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(layer, /@media \(prefers-contrast: more\), \(prefers-reduced-transparency: reduce\)/);
});

test("offline shell assets and system chrome share this review version", () => {
  for (const file of [html, sw, manifest]) {
    assert.ok(file.includes("11.13.0"));
    assert.ok(!file.includes("11.10.1"));
  }
  assert.match(sw, /ballerwatch-v11-13-0-shell/);
  assert.match(html, /styles\.css\?v=11\.12\.0/);
  assert.equal(JSON.parse(manifest).theme_color, "#0D121B");
  assert.equal(JSON.parse(manifest).background_color, "#0D121B");
});

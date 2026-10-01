import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("GitHub Pages PWA has installable project-path manifest and service worker", () => {
  const manifest = JSON.parse(fs.readFileSync("docs/manifest.webmanifest", "utf8"));
  assert.equal(manifest.start_url, "/ballerwatch/");
  assert.equal(manifest.scope, "/ballerwatch/");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  assert.equal(fs.existsSync("docs/apple-touch-icon.png"), true);

  const html = fs.readFileSync("docs/index.html", "utf8");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-touch-icon\.png/);
  assert.match(html, /Enable push/);
  assert.match(html, /id="notification-bell"/);
  assert.match(html, /id="notification-dialog"/);
  assert.match(html, /id="settings"/);

  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /ballerwatch-v3-1-shell/);
});

test("static web app contains no repository secrets or private runtime data", () => {
  const files = [
    "docs/index.html",
    "docs/app.js",
    "docs/sw.js",
    "docs/styles.css",
    "docs/manifest.webmanifest",
    "docs/icon.svg",
  ];
  const text = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(
    text,
    /TELEGRAM_BOT_TOKEN|TRACKER_STATE_KEY|GITHUB_DISPATCH_TOKEN|GOOGLE_CALENDAR_WEBHOOK_SECRET|privateJwk/i,
  );
  assert.doesNotMatch(text, /players\s*[:=]|waitlist\s*[:=]/i);
});

test("GitHub Pages workflow avoids admin-level self-enable permissions", () => {
  const workflow = fs.readFileSync(".github/workflows/pages.yml", "utf8");
  assert.doesNotMatch(workflow, /CRON_GITHUB_PAT/);
  assert.doesNotMatch(workflow, /enablement:\s*true/);
  assert.match(workflow, /Check GitHub Pages activation/);
  assert.match(workflow, /Settings → Pages → Build and deployment → Source → GitHub Actions/);
});


test("Home Screen install card is removed in standalone mode and notifications use the bell panel", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(app, /els\.installCard\?\.remove\(\)/);
  assert.match(app, /notificationDialog\.showModal\(\)/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

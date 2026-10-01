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
  assert.match(html, /Push notifications/);
  assert.match(html, /id="notification-bell"/);
  assert.match(html, /id="notification-dialog"/);
  assert.match(html, /styles\.css\?v=4\.1\.1/);
  assert.match(html, /app\.js\?v=4\.1\.1/);

  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /ballerwatch-v4-1-1-shell/);
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


test("installed PWA aggressively revalidates release assets", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(app, /sw\.js\?v=4\.1\.1/);
  assert.match(app, /updateViaCache:\s*"none"/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /controllerchange/);
  assert.match(sw, /cache:\s*"no-store"/);
});


test("notification bell exposes a synchronized push switch", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(html, /id="bell-push-toggle"/);
  assert.match(html, /role="switch"/);
  assert.match(html, /id="bell-push-status"/);
  assert.match(app, /bellPushToggle\.checked = enabled/);
  assert.match(app, /bellPushToggle\.addEventListener\("change"/);
  assert.match(app, /await enablePush\(\)/);
  assert.match(app, /await disablePush\(\)/);
  assert.match(css, /\.switch-track/);
  assert.match(css, /input:checked \+ \.switch-track/);
});


test("next-game card exposes directions and native share", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(html, /id="next-game-card"/);
  assert.match(html, /id="next-game-directions"/);
  assert.match(html, /id="next-game-share"/);
  assert.match(app, /\/web\/next-game/);
  assert.match(app, /google\.com\/maps\/search\/\?api=1/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /navigator\.clipboard\.writeText/);
});

test("notification test is local and service-worker driven", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(html, /id="test-notification"/);
  assert.match(app, /ballerwatch:test-notification/);
  assert.match(app, /delayMs:\s*5_000/);
  assert.match(sw, /self\.addEventListener\("message"/);
  assert.match(sw, /Test notification/);
  assert.match(sw, /showNotification/);
});


test("main page keeps push controls inside the bell only and install help in the footer", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  assert.match(html, /<footer>[\s\S]*id="install-card"[\s\S]*id="version"/);
  assert.match(html, /id="bell-push-toggle"/);
  assert.doesNotMatch(html, /id="enable-push"/);
  assert.doesNotMatch(html, /id="disable-push"/);
  assert.doesNotMatch(html, /id="settings"/);
});

test("question box supports slash commands and autosuggestions", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(html, /id="question-suggestions"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /type \/ for commands/);
  assert.match(app, /COMMAND_SUGGESTIONS/);
  assert.match(app, /QUESTION_COMPLETIONS/);
  assert.match(app, /ArrowDown/);
  assert.match(app, /ArrowUp/);
  assert.match(app, /activeSuggestionIndex/);
});

test("app-facing copy does not mention Telegram", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const manifest = fs.readFileSync("docs/manifest.webmanifest", "utf8");
  assert.doesNotMatch(html, /Telegram/i);
  assert.doesNotMatch(manifest, /Telegram/i);
});


test("owner settings use a paired gear surface and paired Q&A auth", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const worker = fs.readFileSync("infra/telegram-webhook/worker.mjs", "utf8");
  const listener = fs.readFileSync("listener/bot.mjs", "utf8");
  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(html, /id="owner-pair-form"/);
  assert.match(html, /id="owner-name"/);
  assert.match(html, /id="owner-teams"/);
  assert.match(app, /ballerwatch-owner-token/);
  assert.match(app, /\/web\/owner\/pair/);
  assert.match(app, /\/web\/owner\/settings/);
  assert.match(app, /headers: ownerHeaders\(\)/);
  assert.match(worker, /source: "web-pwa-owner"/);
  assert.match(listener, /\/\?webpair/);
  assert.match(listener, /webPairCodeHash/);
});

test("notification test control is deliberately subtle", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(html, /class="subtle-action" id="test-notification"/);
  assert.match(css, /\.subtle-action/);
  assert.doesNotMatch(html, /secondary" id="test-notification"/);
});


test("answer supports owner-only long-press wrong-answer feedback", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const worker = fs.readFileSync("infra/telegram-webhook/worker.mjs", "utf8");
  const listener = fs.readFileSync("listener/bot.mjs", "utf8");

  assert.match(html, /id="answer-feedback-status"/);
  assert.match(app, /setTimeout\(\(\) => \{[\s\S]*reportWrongAnswer\(\)[\s\S]*\}, 700\)/);
  assert.match(app, /\/web\/feedback/);
  assert.match(app, /headers: ownerHeaders\(\)/);
  assert.match(app, /negative_feedback|Marked wrong/);
  assert.match(worker, /url\.pathname === "\/web\/feedback"/);
  assert.match(worker, /hint: "negative_feedback"/);
  assert.match(listener, /web-pwa-feedback/);
});

test("question autocomplete predicts full sentences from typed prefixes", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(app, /QUESTION_COMPLETIONS/);
  assert.match(app, /sentenceCompletionScore/);
  assert.match(app, /cleanCandidate\.startsWith\(cleanQuery\)/);
  assert.match(app, /event\.key === "Tab"/);
  assert.match(app, /event\.key === "ArrowRight"/);
  assert.match(app, /selectQuestionSuggestion\(0\)/);
  assert.match(app, /What's the pickup count for/);
});


test("mobile header keeps settings and bell on the same row", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.hero-actions \{[^}]*flex-direction:\s*row;/);
  assert.match(css, /\.hero-actions \{[^}]*display:\s*flex;/);
});

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
  assert.match(html, /class="brand-icon"/);
  assert.match(html, /icon\.svg\?v=6\.3\.2/);
  assert.match(html, /Push notifications/);
  assert.match(html, /id="notification-bell"/);
  assert.match(html, /id="notification-dialog"/);
  assert.match(html, /styles\.css\?v=6\.3\.2/);
  assert.match(html, /app\.js\?v=6\.3\.2/);

  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /ballerwatch-v6-3-2-shell/);
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
    /TRACKER_STATE_KEY|GITHUB_DISPATCH_TOKEN|GOOGLE_CALENDAR_WEBHOOK_SECRET|privateJwk/i,
  );
  assert.doesNotMatch(text, /players\s*[:=]|waitlist\s*[:=]/i);
});

test("GitHub Pages workflow self-recovers missing Pages activation", () => {
  const workflow = fs.readFileSync(".github/workflows/pages.yml", "utf8");
  assert.doesNotMatch(workflow, /CRON_GITHUB_PAT/);
  assert.match(workflow, /Check GitHub Pages activation/);
  assert.match(workflow, /Enable GitHub Pages when missing/);
  assert.match(workflow, /enablement:\s*true/);
  assert.match(workflow, /secrets\.RELEASE_GITHUB_TOKEN/);
  assert.doesNotMatch(workflow, /release:\s*\n\s*types:\s*\[published\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref:\s*production/);
});


test("Home Screen install card is removed in standalone mode and notifications use the bell panel", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(app, /els\.installCard\?\.remove\(\)/);
  assert.match(app, /notificationDialog\.showModal\(\)/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});




test("Home Screen install prompt uses the same card layout system as dashboard cards", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(html, /class="card footer-install" id="install-card"/);
  assert.match(html, /class="footer-install-copy"/);
  assert.match(css, /\.footer-install\.card \{[\s\S]*padding:\s*clamp/);
  assert.match(css, /\.footer-install\.card \{[\s\S]*border-radius:\s*30px/);
});

test("installed PWA aggressively revalidates release assets", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(app, /sw\.js\?v=6\.3\.2/);
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


test("next-game card exposes pickup RSVP, directions, and native share", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(html, /id="next-game-card"/);
  assert.match(html, /id="next-game-rsvp"/);
  assert.match(html, /id="next-game-directions"/);
  assert.match(html, /id="next-game-share"/);
  assert.match(app, /\/web\/next-game/);
  assert.match(app, /model\.rsvp/);
  assert.match(app, /google\.com\/maps\/search\/\?api=1/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /navigator\.clipboard\.writeText/);
});



test("match spotlight shows a subtle source freshness line", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");

  assert.match(html, /id="next-game-updated"/);
  assert.match(app, /function matchUpdatedText/);
  assert.match(app, /game\.sourceUpdatedAt/);
  assert.match(css, /\.match-update-credit \{[\s\S]*color:\s*#64748b;[\s\S]*font-size:\s*var\(--type-caption\)/);
  assert.match(worker, /pickup\/state\/source-health\.json/);
  assert.match(worker, /sourceUpdatedAt:/);
});

test("pickup RSVP button is neutral until authenticated confirmation is known", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(app, /confirmedRsvpDates = new Set/);
  assert.match(app, /model\.rsvpConfirmed \? "RSVP'd" : "RSVP"/);
  assert.match(css, /\.pickup-rsvp-link \{[\s\S]*rgba\(71, 85, 105, 0\.36\)/);
  assert.match(css, /\.pickup-rsvp-link\.is-confirmed \{[\s\S]*rgba\(74, 222, 128/);
  assert.match(css, /\.pickup-rsvp-link\.is-confirmed::before \{[\s\S]*content:\s*"✓"/);
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
  assert.match(html, /\/ commands|type <strong>\/<\/strong> for commands/);
  assert.match(app, /COMMAND_SUGGESTIONS/);
  assert.match(app, /BASE_QUESTION_COMPLETIONS/);
  assert.match(app, /ArrowDown/);
  assert.match(app, /ArrowUp/);
  assert.match(app, /activeSuggestionIndex/);
});


test("app-facing copy is web-only", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const manifest = fs.readFileSync("docs/manifest.webmanifest", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.doesNotMatch(html, /https:\/\/t\.me\//i);
  assert.doesNotMatch(app, /\/web\/user\/pair/);
  assert.match(app, /https:\/\/ballerwatch-web\.vudhone\.workers\.dev/);
  assert.doesNotMatch(manifest, /chat|messaging adapter/i);
});


test("user settings support password-only sign-in with repository recovery", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  const recovery = fs.readFileSync(".github/workflows/reset-user-password.yml", "utf8");

  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(html, /id="owner-login-form"/);
  assert.match(html, /id="owner-login-password"/);
  assert.match(html, /id="owner-password-form"/);
  assert.match(html, /Reset web user password/);
  assert.match(html, /id="owner-name"/);
  assert.match(html, /id="owner-teams"/);
  assert.doesNotMatch(html, /owner-pair-form|one-time-code|pairing code/i);

  assert.match(app, /ballerwatch-owner-token/);
  assert.match(app, /\/web\/user\/login/);
  assert.match(app, /\/web\/user\/password/);
  assert.match(app, /\/web\/user\/settings/);
  assert.match(app, /retryNetwork:\s*true/);
  assert.doesNotMatch(app, /\/web\/user\/pair/);
  assert.match(app, /ownerLoginForm\.addEventListener\("submit", loginOwnerDevice\)/);
  assert.match(app, /ownerPasswordForm\.addEventListener\("submit", saveOwnerPassword\)/);

  assert.match(worker, /export async function createOwnerPasswordRecord/);
  assert.match(worker, /export async function verifyOwnerPassword/);
  assert.match(worker, /userRoute\(url\.pathname, "login"\)/);
  assert.match(worker, /userRoute\(url\.pathname, "password"\)/);
  assert.match(worker, /freshTeamsRecord = await githubStateRecord/);
  assert.match(worker, /User settings load failed/);
  assert.doesNotMatch(worker, /userRoute\(url\.pathname, "pair"\)/);

  assert.match(recovery, /BALLERWATCH_RECOVERY_PASSWORD/);
  assert.match(recovery, /node shared\/user-recovery\.mjs reset/);
  assert.match(recovery, /node shared\/runtime-state\.mjs pull user/);
  assert.match(recovery, /node shared\/runtime-state\.mjs push user/);
});

test("notification test control is deliberately subtle", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(html, /class="subtle-action" id="test-notification"/);
  assert.match(css, /\.subtle-action/);
  assert.doesNotMatch(html, /secondary" id="test-notification"/);
});



test("answer feedback is gesture-only, answer-scoped, and persists directly through the web runtime", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");

  assert.doesNotMatch(html, /id="answer-feedback-button"/);
  assert.match(html, /id="answer-feedback-status"/);
  assert.doesNotMatch(app, /answerFeedbackButton/);
  assert.match(app, /addEventListener\("dblclick"/);
  assert.match(app, /ANSWER_FEEDBACK_HOLD_MS = 650/);
  assert.match(app, /addEventListener\("pointerdown"/);
  assert.match(app, /action: wasSubmitted \? "cancel" : "mark"/);
  assert.match(app, /intent: lastAnswerExchange\.intent \|\| ""/);
  assert.match(css, /\.answer \{[\s\S]*user-select:\s*none;[\s\S]*touch-action:\s*manipulation;/);
  assert.match(worker, /async function authRateRequests/);
  assert.match(worker, /\["ip", ip\]/);
  assert.match(worker, /AUTH_FAILURE_TTL_SECONDS = 600/);
  assert.match(worker, /export async function issueFeedbackToken/);
  assert.match(worker, /export async function verifyFeedbackToken/);
  assert.match(worker, /hint: "negative_feedback"/);
});

test("signed-in web feature requests persist privately and expose only aggregate categories", () => {
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  const paths = fs.readFileSync("shared/runtime-paths.mjs", "utf8");
  const summary = fs.readFileSync("shared/feature-request-summary.mjs", "utf8");

  assert.match(worker, /async function persistFeatureRequest/);
  assert.match(worker, /requests\/private\.json/);
  assert.match(worker, /requests\/unknown\.json/);
  assert.match(worker, /function featureRequestText/);
  assert.match(worker, /source: "manual"/);
  assert.match(worker, /Sign in to submit a feature request/);
  assert.match(worker, /Feature request saved for review/);
  assert.match(paths, /"requests\/private\.json"/);
  assert.match(summary, /publicRequestSummary/);
  assert.doesNotMatch(summary, /node:fs|node:path/);
});

test("chat history fallback keeps answer intent when AI compaction is unavailable", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");

  assert.match(app, /intent: payload\.intent \|\| ""/);
  assert.match(worker, /intent: cleanText\(event\.intent, 60\)/);
  assert.match(worker, /Deterministic review fallback used because AI compaction was unavailable/);
  assert.match(worker, /source: entry\.source/);
  assert.match(worker, /intent: entry\.intent/);
});

test("question autocomplete predicts full sentences from typed prefixes", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(app, /BASE_QUESTION_COMPLETIONS/);
  assert.match(app, /sentenceCompletionScore/);
  assert.match(app, /calendarQuestionCompletions/);
  assert.match(app, /QUESTION_HISTORY_KEY/);
  assert.match(app, /rememberQuestion\(question\)/);
  assert.match(app, /cleanCandidate\.startsWith\(cleanQuery\)/);
  assert.match(app, /editDistanceAtMostOne/);
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



test("password recovery is admin-controlled, temporary-secret based, and revokes sessions", () => {
  const recovery = fs.readFileSync(".github/workflows/reset-user-password.yml", "utf8");
  const helper = fs.readFileSync("shared/user-recovery.mjs", "utf8");

  assert.match(recovery, /workflow_dispatch:/);
  assert.match(recovery, /Confirmation must be RESET/);
  assert.match(recovery, /BALLERWATCH_RECOVERY_PASSWORD/);
  assert.match(recovery, /TRACKER_STATE_KEY/);
  assert.match(helper, /Recovery password must be between 12 and 200 characters/);
  assert.match(helper, /webAuthVersion/);
  assert.match(helper, /nextVersion/);
  assert.match(helper, /webOwnerPassword/);
  assert.doesNotMatch(helper, /console\.log\([^\n]*password/i);
});

test("two-week dashboard renders cached match weather", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  const watchdog = fs.readFileSync(".github/workflows/watchdog.yml", "utf8");

  assert.match(html, /id="two-week-calendar"/);
  assert.match(html, /id="calendar-grid"/);
  assert.match(html, /Open-Meteo/);
  assert.match(html, /OpenStreetMap contributors/);
  assert.match(app, /\/web\/calendar/);
  assert.match(app, /weatherSummary/);
  assert.match(css, /\.calendar-grid/);
  assert.match(css, /\.spotlight-card/);
  assert.match(css, /\/\* v5 dashboard \*\//);
  assert.match(watchdog, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(watchdog, /node weather\/update\.mjs/);
});

test("calendar rolls by week with spotlight navigation and expands through the latest match week", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.doesNotMatch(html, /id="calendar-expand-toggle"/);
  assert.match(html, /id="two-week-calendar" aria-expanded="false"/);
  assert.match(app, /let calendarWindowStart = ""/);
  assert.match(app, /let calendarExpanded = false/);
  assert.match(app, /function ensureCalendarDateVisible/);
  assert.match(app, /start = addIsoDays\(start, 7\)/);
  assert.match(app, /Math\.ceil\(span \/ 7\) \* 7/);
  assert.match(app, /function setCalendarExpanded/);
  assert.match(app, /calendarCard\?\.addEventListener\("click"/);
  assert.match(css, /\.calendar-card\.is-expanded \.calendar-grid/);
});


test("cron-job.org is reserved for pickup and league while watchdog is retired", () => {
  const schedules = fs.readFileSync("infra/external-schedules.mjs", "utf8");
  assert.match(schedules, /BallerWatch - Pickup watcher/);
  assert.match(schedules, /BallerWatch - League watcher/);
  assert.match(schedules, /RETIRED_EXTERNAL_SCHEDULE_SPECS/);
  assert.match(schedules, /BallerWatch - System watchdog/);
  const primaryBlock = schedules.match(/EXTERNAL_SCHEDULE_SPECS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(primaryBlock);
  assert.doesNotMatch(primaryBlock[1], /System watchdog/);
});


test("weather refresh is owned by schedule changes and the watchdog without a duplicate workflow", () => {
  const pickup = fs.readFileSync(".github/workflows/pickup.yml", "utf8");
  const league = fs.readFileSync(".github/workflows/league.yml", "utf8");
  const watchdog = fs.readFileSync(".github/workflows/watchdog.yml", "utf8");

  assert.equal(fs.existsSync(".github/workflows/weather-refresh.yml"), false);
  assert.match(pickup, /Refresh weather after pickup schedule change/);
  assert.match(pickup, /node weather\/update\.mjs/);
  assert.match(league, /Refresh weather after league schedule change/);
  assert.match(league, /node weather\/update\.mjs/);
  assert.match(watchdog, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(watchdog, /node weather\/update\.mjs/);
});


test("calendar selection reuses the main spotlight instead of a second detail panel", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");

  assert.match(html, /id="spotlight-label"/);
  assert.match(html, /id="calendar-game-picker"/);
  assert.doesNotMatch(html, /id="calendar-detail"/);
  assert.match(app, /function selectCalendarDate/);
  assert.match(app, /renderNextGame\(game, "SELECTED GAME"\)/);
  assert.match(app, /nextGameCard\.classList\.add\("spotlight-selected"\)/);
  assert.match(app, /scrollIntoView\(\{ behavior: "smooth"/);
});

test("liquid glass visual system has blur, translucent layers, and fallback", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(css, /\/\* v5\.1 liquid glass \*\//);
  assert.match(css, /backdrop-filter:\s*blur\(/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(css, /--glass-fill:/);
  assert.match(css, /@supports not \(\(backdrop-filter:/);
  assert.match(css, /\.calendar-game-choice/);
});


test("typography uses one native system stack and normalized scale", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(css, /\/\* v5\.1\.1 typography system \*\//);
  assert.match(css, /--font-ui:\s*-apple-system, BlinkMacSystemFont/);
  assert.match(css, /--type-caption:\s*0\.6875rem/);
  assert.match(css, /--type-small:\s*0\.75rem/);
  assert.match(css, /--type-body:\s*0\.875rem/);
  assert.match(css, /--type-section:\s*1\.125rem/);
  assert.match(css, /input,[\s\S]*textarea \{[\s\S]*font-size:\s*1rem/);
  assert.doesNotMatch(css, /font-family:\s*Inter/);
  assert.doesNotMatch(css, /font-weight:\s*(650|750)/);
});


test("pickup spotlight shows reserved and capacity", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(app, /game\.kind === "pickup" && game\.reserved != null/);
  assert.match(app, /\$\{game\.reserved\} \/ \$\{game\.capacity\} reserved/);
  assert.match(app, /capacityText/);
  assert.match(app, /weatherApproximate/);
  assert.match(app, /Seattle-area/);
});


test("installed app refreshes data and release updates automatically", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(app, /LIVE_DATA_REFRESH_MS = 60_000/);
  assert.match(app, /APP_UPDATE_CHECK_MS = 5 \* 60_000/);
  assert.match(app, /function refreshLiveData/);
  assert.match(app, /function checkForAppUpdate/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /calendarOk && boardOk \? "live" : "offline"/);
  assert.match(css, /@keyframes ballerwatch-live-pulse/);
  assert.match(css, /\.system-line\.is-live \.system-dot/);
});

test("web Live status requires successful runtime-backed reads", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  const refresh = app.match(/async function refreshLiveData\(\)[\s\S]*?\n}\n/)?.[0] || "";
  const config = app.match(/async function loadConfig\(\)[\s\S]*?\n}\n/)?.[0] || "";
  const online = app.match(/window\.addEventListener\("online"[\s\S]*?\n}\);/)?.[0] || "";

  assert.match(refresh, /const \[calendarOk, boardOk\] = await Promise\.all/);
  assert.match(refresh, /calendarOk && boardOk \? "live" : "offline"/);
  assert.doesNotMatch(config, /setSystemState\("live"\)/);
  assert.match(online, /setSystemState\("checking"\)/);
  assert.doesNotMatch(online, /setSystemState\("live"\)/);
});

test("Worker readiness uses a dedicated GitHub contents credential and probes live data", () => {
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  const deploy = fs.readFileSync(".github/workflows/deploy-worker.yml", "utf8");

  assert.match(worker, /GITHUB_CONTENTS_TOKEN/);
  assert.match(worker, /githubContentsToken\(env\)/);
  assert.match(worker, /GITHUB_DISPATCH_TOKEN/);
  assert.match(worker, /url\.pathname === "\/health"[\s\S]*loadSnapshot\(env\)/);
  assert.match(worker, /url\.pathname === "\/web\/config"[\s\S]*loadSnapshot\(env\)/);
  assert.doesNotMatch(
    worker.match(/url\.pathname === "\/web\/config"[\s\S]*?\n    }/)?.[0] || "",
    /loadSnapshot\(env\)\.catch/,
  );

  assert.match(deploy, /RELEASE_GITHUB_TOKEN/);
  assert.match(deploy, /GITHUB_CONTENTS_TOKEN: process\.env\.RELEASE_GITHUB_TOKEN/);
  assert.match(deploy, /GITHUB_DISPATCH_TOKEN: process\.env\.CRON_GITHUB_PAT/);
  assert.match(deploy, /Verify dedicated runtime contents credential/);
  assert.match(deploy, /\/web\/next-game/);
  assert.match(deploy, /\/web\/calendar/);
  assert.match(deploy, /Worker readiness verified/);
});

test("calendar refresh preserves an explicitly selected future game", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(app, /let selectedCalendarGameId = ""/);
  assert.match(app, /availableGames\.find\(\(game\) => game\.id === selectedCalendarGameId\)/);
  assert.match(app, /renderNextGame\(selectedGame, "SELECTED GAME"\)/);
});


test("autocomplete floats above the Ask card without resizing the input row", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(css, /\/\* v5\.6 autocomplete overlay \*\//);
  assert.match(css, /\.ask-card \{[\s\S]*overflow:\s*visible;/);
  assert.match(css, /\.ask-card form \{[\s\S]*z-index:\s*10;/);
  assert.match(css, /\.question-input-wrap \{[\s\S]*position:\s*relative;/);
  const overlay = css.slice(css.indexOf("/* v5.6 autocomplete overlay */"));
  assert.match(overlay, /\.question-suggestions \{/);
  assert.match(overlay, /position:\s*absolute;/);
  assert.match(overlay, /top:\s*calc\(100% \+ 0\.45rem\);/);
  assert.match(overlay, /z-index:\s*80;/);
  assert.match(css, /max-height:\s*min\(18rem, 42vh\)/);
  assert.match(css, /overflow-y:\s*auto;/);
  assert.match(css, /overscroll-behavior:\s*contain;/);
  assert.match(css, /\.ask-card \.question-row > button \{[\s\S]*align-self:\s*center;/);
});

test("weather refresh is immediate only for schedule-relevant changes", () => {
  const pickup = fs.readFileSync("pickup/update.mjs", "utf8");
  const pickupWorkflow = fs.readFileSync(".github/workflows/pickup.yml", "utf8");
  const leagueWorkflow = fs.readFileSync(".github/workflows/league.yml", "utf8");
  const relevance = fs.readFileSync("weather/relevance.mjs", "utf8");

  assert.match(pickup, /pickupWeatherChanged/);
  assert.match(pickup, /weather-refresh-needed/);
  assert.match(pickupWorkflow, /Refresh weather after pickup schedule change/);
  assert.match(pickupWorkflow, /node weather\/update\.mjs/);
  assert.match(leagueWorkflow, /Refresh weather after league schedule change/);
  assert.match(leagueWorkflow, /needsCalendar == 'true'/);
  assert.doesNotMatch(relevance, /reserved|capacity|players|waitlist/);
});


test("installed app does not interrupt first-load hydration for a service-worker update", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");

  assert.match(app, /let initialLoadComplete = false/);
  assert.match(app, /let appRefreshDeferred = false/);
  assert.match(
    app,
    /if \(!initialLoadComplete\) \{\s*appRefreshDeferred = true;\s*return;\s*\}/,
  );
  assert.match(
    app,
    /await Promise\.all\(\[\s*registerServiceWorker\(\)\.catch\(\(\) => null\),\s*loadConfig\(\),\s*loadBoard\(\),\s*loadCalendar\(\),\s*\]\);/,
  );
  assert.match(app, /initialLoadComplete = true/);
  assert.match(
    app,
    /if \(appRefreshDeferred && initialLoadComplete\) \{\s*window\.location\.reload\(\);\s*return;\s*\}/,
  );
});


test("notification inbox tracks unread state, opens full-screen detail, and animates swipe delete", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /id="notification-reader"/);
  assert.match(html, /class="push-compact"/);
  assert.match(app, /NOTIFICATION_READ_KEY/);
  assert.match(app, /NOTIFICATION_DELETED_KEY/);
  assert.match(app, /function markNotificationRead/);
  assert.match(app, /function deleteNotification/);
  assert.match(app, /function animateNotificationDelete/);
  assert.match(app, /function openNotification/);
  assert.match(app, /touchmove/);
  assert.match(app, /translateX\(\$\{offset\}px\)/);
  assert.match(app, /deltaX < -64/);
  assert.match(app, /classList\.add\("is-deleting"\)/);
  assert.match(app, /unreadCount/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(css, /\.notice\.is-swiping/);
  assert.match(css, /\.notice\.is-deleting/);
  assert.match(css, /translateX\(-120%\)/);
  assert.match(css, /\.notification-reader \{/);
  assert.match(css, /height:\s*100dvh/);
});

test("notification push control is compact and only displays On or Off", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /class="push-compact"/);
  assert.doesNotMatch(html, /class="notification-push-row"/);
  assert.match(app, /textContent = enabled \? "On" : "Off"/);
  assert.match(css, /\.switch-compact \.switch-track/);
  assert.match(css, /width:\s*2\.15rem/);
});

test("next-game sharing uses the generic device share sheet", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");

  assert.match(html, /id="next-game-share" type="button">Share<\/button>/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /title: "BallerWatch game"/);
  assert.match(app, /Game details copied/);
  assert.doesNotMatch(app, /Choose Tesla in the share sheet/);
  assert.doesNotMatch(app, /https:\/\/ts\.la\/app/);
});



test("app and repository expose explicit BallerWatch copyright notices", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  const readme = fs.readFileSync("README.md", "utf8");
  const copyright = fs.readFileSync("COPYRIGHT.md", "utf8");

  assert.match(html, /© 2026 BallerWatch\. All rights reserved\./);
  assert.match(app, /Copyright © 2026 BallerWatch\. All rights reserved\./);
  assert.match(worker, /Copyright © 2026 BallerWatch\. All rights reserved\./);
  assert.match(readme, /## Copyright/);
  assert.match(copyright, /Publication of the source code in a public repository does not by itself grant a license/);
});

test("footer contains no secondary messaging shortcut", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  assert.doesNotMatch(html, /https:\/\/t\.me\//i);
  assert.match(html, /id="install-card"/);
});


test("website and utility surfaces share the same wider centered page footprint", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(css, /--app-surface-width:\s*920px/);
  assert.match(css, /\.shell \{[\s\S]*width:\s*min\(var\(--app-surface-width\), 100%\)/);
  assert.match(
    css,
    /\.notification-dialog,[\s\S]*\.settings-dialog,[\s\S]*\.notification-reader \{[\s\S]*width:\s*min\(var\(--app-surface-width\)/,
  );
  assert.match(
    css,
    /\.notification-dialog \{[\s\S]*top:\s*50%;[\s\S]*left:\s*50%;[\s\S]*transform:\s*translate\(-50%, -50%\)/,
  );
  assert.match(css, /\.notification-reader \{[\s\S]*height:\s*auto;[\s\S]*border-radius:\s*30px/);
});

test("notification popup stays bounded and offers local Delete all beside Send test", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(
    html,
    /id="test-notification"[^>]*>Send test<\/button>\s*<button class="subtle-action subtle-danger" id="delete-all-notifications"[^>]*>Delete all<\/button>/,
  );
  assert.match(app, /function deleteAllNotifications/);
  assert.match(app, /persistDeletedNotifications\(visible\)/);
  assert.match(app, /deleteAllNotifications\.addEventListener\("click", deleteAllNotifications\)/);
  assert.match(css, /\.notification-dialog \{[\s\S]*max-height:\s*min\(86dvh, 42rem\);[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.notification-dialog \.board \{[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /\.notification-test-row \{[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.notification-reader \{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /\.notification-reader-content \{[\s\S]*max-width:\s*100%;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.notification-reader-content p \{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/);
});


test("match spotlight swipe uses connected neighboring cards like a carousel train", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /id="spotlight-carousel"/);
  assert.match(html, /id="spotlight-previous"/);
  assert.match(html, /id="spotlight-next"/);
  assert.match(html, /class="spotlight-content"/);
  assert.match(app, /function spotlightModel/);
  assert.match(app, /function buildSpotlightTrainCard/);
  assert.match(app, /function syncSpotlightCardDimensions/);
  assert.match(app, /--spotlight-card-height/);
  assert.match(app, /probes\s*\.map\(\(probe\) => probe\.getBoundingClientRect\(\)\.height\)/);
  assert.match(app, /Math\.ceil\(Math\.max\(\.\.\.heights\)\)/);
  assert.doesNotMatch(app, /current\.scrollHeight/);
  assert.match(app, /window\.addEventListener\("resize"/);
  assert.match(app, /function adjacentCalendarSelection/);
  assert.match(app, /\.filter\(\(date\) => date >= firstDate\)/);
  assert.doesNotMatch(app, /const lastDate = addIsoDays\(firstDate, 13\)/);
  assert.match(app, /function selectAdjacentCalendarGameDate/);
  assert.match(app, /function installSpotlightSwipe/);
  assert.match(app, /spotlightCarousel/);
  assert.match(app, /cloneNode\(true\)/);
  assert.match(app, /classList\.add\("spotlight-train-card"\)/);
  assert.match(app, /preview\.style\.transform = `translate3d/);
  assert.match(app, /current\.style\.transform = `translate3d/);
  assert.match(app, /committedTrain\.preview\.style\.transform = "translate3d\(0, 0, 0\)"/);
  assert.match(app, /selectCalendarDate\(committedTrain\.target\.date\)/);
  assert.match(app, /document\.documentElement\.classList\.add\("spotlight-swipe-active"\)/);
  assert.match(
    app,
    /button\.setAttribute\("aria-selected", String\(button\.dataset\.date === date\)\)/,
  );
  assert.match(app, /renderCalendarGamePicker\(games, game\.id \|\| ""\)/);
  assert.match(app, /event\.target\.closest\?\.\("a, button"\)/);
  assert.match(css, /\/\* v5\.3\.3 connected-card carousel swipe \*\//);
  assert.match(css, /\.spotlight-carousel \{[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /--spotlight-train-gap:\s*12px/);
  assert.match(css, /height:\s*var\(--spotlight-card-height, auto\)/);
  assert.match(css, /\.spotlight-measure-card \{[\s\S]*height:\s*auto !important;/);
  assert.match(css, /\.spotlight-train-card \{[\s\S]*position:\s*absolute;/);
  assert.match(css, /\.spotlight-card\.is-train-dragging/);
  assert.match(css, /\.spotlight-card\.is-train-settling/);
  assert.match(css, /transition:\s*transform 260ms/);
  assert.match(css, /html\.spotlight-swipe-active[\s\S]*overscroll-behavior-x:\s*none;/);
  assert.match(app, /function syncSpotlightEdgeControls/);
  assert.match(app, /spotlightPrevious\.addEventListener\("click"/);
  assert.match(app, /spotlightNext\.addEventListener\("click"/);
  assert.match(app, /window\.requestAnimationFrame\(completeTrain\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /\.spotlight-edge-control \{[\s\S]*width:\s*min\(5\.5rem, 18%\)/);
  assert.match(css, /\.spotlight-edge-control::before/);
  assert.match(css, /backdrop-filter:\s*blur\(7px\)/);
  assert.match(css, /\.spotlight-edge-control span \{[\s\S]*border:\s*0;/);
  assert.match(css, /\.spotlight-edge-control span \{[\s\S]*background:\s*transparent;/);
  assert.match(css, /\.spotlight-edge-control:not\(:disabled\):hover::before/);
  assert.match(css, /\.spotlight-edge-control:not\(:disabled\):hover span/);
});


test("v5.5 dashboard matches the iPhone-first demo direction", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /Pickup \+ RATS monitor/);
  assert.match(html, /<h2 id="calendar-title">14-Day Calendar<\/h2>/);
  assert.match(html, /<h2>Ask BallerWatch<\/h2>/);
  assert.match(html, /id="next-game-capacity"/);
  assert.match(app, /capacityPercent/);
  assert.match(app, /spotsText/);
  assert.match(app, /title: game\.dateLabel \|\| game\.title/);
  assert.match(css, /\/\* v5\.5 iPhone dashboard visual refresh \*\//);
  assert.match(css, /\.spotlight-content \{[\s\S]*grid-template-areas:/);
  assert.match(css, /\.next-game-capacity-track/);
  assert.match(css, /\.calendar-day\[aria-selected="true"\]/);
  assert.match(css, /\.notification-dialog \{[\s\S]*position:\s*fixed;/);
  assert.match(css, /\.ask-card h2::before/);
});

test("installed iPhone mode adds a blurred status-area separation layer", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /class="status-bar-glass"/);
  assert.match(app, /classList\.toggle\("is-standalone", standalone\(\)\)/);
  assert.match(css, /html\.is-standalone \.status-bar-glass/);
  assert.match(css, /height:\s*calc\(env\(safe-area-inset-top\) \+ 0\.7rem\)/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(22px\)/);
});



test("production rollout is release-gated and Pages waits for Worker readiness", () => {
  const pages = fs.readFileSync(".github/workflows/pages.yml", "utf8");
  const worker = fs.readFileSync(".github/workflows/deploy-worker.yml", "utf8");
  const webRuntime = fs.readFileSync(".github/workflows/web-app.yml", "utf8");
  const calendarBridge = fs.readFileSync(".github/workflows/deploy-apps-script.yml", "utf8");
  const promote = fs.readFileSync(".github/workflows/promote-release.yml", "utf8");
  const pickup = fs.readFileSync(".github/workflows/pickup.yml", "utf8");
  const league = fs.readFileSync(".github/workflows/league.yml", "utf8");
  const watchdog = fs.readFileSync(".github/workflows/watchdog.yml", "utf8");
  const schedules = fs.readFileSync("infra/external-schedules.mjs", "utf8");

  for (const workflow of [worker, webRuntime, calendarBridge]) {
    assert.match(workflow, /release:\s*\n\s*types:\s*\[published\]/);
    assert.doesNotMatch(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
    assert.match(workflow, /github\.event\.release\.tag_name \|\| 'production'/);
  }

  assert.match(pages, /workflow_dispatch:/);
  assert.match(pages, /ref:\s*production/);
  assert.match(pages, /push:\s*\n\s*branches:\s*\[main\][\s\S]*\.github\/workflows\/pages\.yml/);

  assert.match(promote, /cron:\s*"37 \* \* \* \*"/);
  assert.match(promote, /86400/);
  assert.match(promote, /gh release create/);
  assert.match(promote, /git\/refs\/heads\/production/);
  assert.match(promote, /RELEASE_GITHUB_TOKEN/);
  assert.doesNotMatch(promote, /gh workflow run pages\.yml/);

  assert.match(worker, /Verify web Worker readiness and security/);
  assert.match(worker, /Deploy Pages after Worker is healthy/);
  assert.match(worker, /gh workflow run pages\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);

  for (const workflow of [pickup, league, watchdog]) {
    assert.match(workflow, /ref:\s*production/);
  }
  assert.match(schedules, /BALLERWATCH_BRANCH \|\| "production"/);
});


test("web runtime requires the dedicated state key and web-only Worker", () => {
  const deploy = fs.readFileSync(".github/workflows/deploy-worker.yml", "utf8");
  const stateCrypto = fs.readFileSync("shared/state-crypto.mjs", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const retiredPrefix = ["TELE", "GRAM"].join("");

  const requiredBlock = deploy.match(
    /- name: Verify required core secrets[\s\S]*?(?=\n      - name:)/,
  )?.[0] || "";
  assert.match(requiredBlock, /TRACKER_STATE_KEY/);
  assert.match(requiredBlock, /CRON_GITHUB_PAT/);
  assert.match(requiredBlock, /RELEASE_GITHUB_TOKEN/);
  assert.doesNotMatch(deploy, new RegExp(retiredPrefix, "i"));
  assert.doesNotMatch(stateCrypto, new RegExp(retiredPrefix, "i"));
  assert.doesNotMatch(worker, new RegExp(retiredPrefix, "i"));
  assert.match(worker, /BALLERWATCH_WORKER_SECRET/);
  assert.match(app, /https:\/\/ballerwatch-web\.vudhone\.workers\.dev/);
});

test("repository policy reserves SemVer for product behavior changes", () => {
  const agents = fs.readFileSync("AGENTS.md", "utf8");

  assert.match(agents, /Version numbers represent \*\*actual product changes\*\*/);
  assert.match(agents, /No SemVer bump/);
  assert.match(agents, /documentation-only edits/);
  assert.match(agents, /behavior-preserving refactors/);
  assert.match(agents, /CI\/workflow maintenance/);
  assert.match(agents, /published GitHub Release\/tag/);
  assert.match(agents, /24 hours/);
});



test("runtime deployment migrates every web scope and audits full branch encryption", () => {
  const deploy = fs.readFileSync(".github/workflows/deploy-worker.yml", "utf8");
  const watchdog = fs.readFileSync(".github/workflows/watchdog.yml", "utf8");
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");

  assert.match(deploy, /for scope in user pickup league watchdog weather web/);
  assert.match(deploy, /node shared\/runtime-state\.mjs audit/);
  assert.match(watchdog, /Audit runtime-state encryption/);
  assert.match(watchdog, /node shared\/runtime-state\.mjs audit/);
  assert.match(worker, /async function userStateDocument/);
  assert.match(worker, /githubStateRecord\(env, "state\/user\.json"\)/);
  assert.match(worker, /await encryptState\((?:next|\{ settings \}), env\)/);
});

test("retired watchdog dispatches skip before runner allocation", () => {
  const workflow = fs.readFileSync(".github/workflows/watchdog.yml", "utf8");
  assert.match(
    workflow,
    /if: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.external_fallback == true \}\}/,
  );
});

test("external cron repair is manual-only because Worker deploy owns normal sync", () => {
  const repair = fs.readFileSync(".github/workflows/setup-cron.yml", "utf8");
  const deploy = fs.readFileSync(".github/workflows/deploy-worker.yml", "utf8");

  assert.match(repair, /^name: Repair external cron schedules/m);
  assert.match(repair, /workflow_dispatch:/);
  assert.doesNotMatch(repair, /release:\s*\n\s*types:/);
  assert.match(deploy, /Ensure primary GitHub schedules stay enabled/);
});


test("GitHub Actions dependencies are pinned to reviewed commit SHAs", () => {
  const workflowDir = ".github/workflows";
  const workflows = fs.readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
  const unpinned = [];
  for (const name of workflows) {
    const source = fs.readFileSync(`${workflowDir}/${name}`, "utf8");
    for (const match of source.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/g)) {
      if (!/^[0-9a-f]{40}$/i.test(match[2])) {
        unpinned.push(`${name}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(unpinned, []);
});

test("PWA declares restrictive document policy and confines notification navigation", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(sw, /function safeAppUrl/);
  assert.match(sw, /url\.origin !== new URL\(APP_URL\)\.origin/);
  assert.match(sw, /url\.pathname\.startsWith\("\/ballerwatch\/"\)/);
  assert.match(sw, /clients\.openWindow\(target\)/);
});

test("Worker web API sets defense-in-depth security headers and protects push registration", () => {
  const worker = fs.readFileSync("infra/web-worker/worker.mjs", "utf8");
  assert.match(worker, /"content-security-policy"/);
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /"x-content-type-options": "nosniff"/);
  assert.match(worker, /"x-frame-options": "DENY"/);
  assert.match(worker, /"referrer-policy": "no-referrer"/);
  assert.match(worker, /"permissions-policy"/);
  assert.match(worker, /\/web\/push\/challenge/);
  assert.match(worker, /verifyPushRegistrationChallenge/);
  assert.match(worker, /webRequestOriginAllowed/);
  assert.match(worker, /rotateOwnerAuthVersion/);
});


test("README includes the web app demo and multi-user settings are exposed", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(readme, /!\[BallerWatch web app demo\]\(docs\/demo\.jpg\)/);
  assert.equal(fs.existsSync("docs/demo.jpg"), true);
  assert.match(html, /id="owner-login-username"/);
  assert.match(html, /id="user-management"/);
  assert.match(html, /id="user-create-form"/);
  assert.match(app, /\/web\/user\/users/);
  assert.match(app, /OWNER_USERNAME_KEY/);
  assert.match(app, /canManageUsers/);
});


test("hidden match override editor is gesture-driven and resettable", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(html, /id="match-override-dialog" class="match-override-dialog"/);
  assert.match(html, /id="match-override-reset"/);
  assert.match(html, /Reset to source/);
  assert.match(app, /MATCH_OVERRIDE_DOUBLE_TAP_MS = 500/);
  assert.match(app, /MATCH_OVERRIDE_TAP_MOVE_TOLERANCE_PX = 14/);
  assert.match(html, /<button id="version" class="version-trigger"/);
  assert.match(html, /Double-tap on touch or double-click on desktop/);
  assert.match(app, /function installTouchDoubleTap/);
  assert.match(app, /addEventListener\("touchend"/);
  assert.match(app, /event\.changedTouches/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /\{ passive: false \}/);
  assert.match(app, /installTouchDoubleTap\(els\.version\)/);
  assert.match(app, /installTouchDoubleTap\(els\.nextGameCard/);
  assert.match(app, /version\.addEventListener\("dblclick"/);
  assert.match(app, /nextGameCard\.addEventListener\("dblclick"/);
  assert.match(app, /openMatchOverrideEditorOnce/);
  assert.doesNotMatch(app, /handleVersionDoubleActivation/);
  assert.doesNotMatch(app, /handleMatchCardDoubleActivation/);
  assert.doesNotMatch(app, /MATCH_OVERRIDE_HOLD_MS/);
  assert.match(fs.readFileSync("docs\/styles\.css", "utf8"), /-webkit-touch-callout:\s*none/);
  assert.match(app, /\/web\/user\/match-override/);
  assert.match(app, /method: "DELETE"/);
  assert.match(app, /pendingMatchOverrideAfterLogin/);
  assert.match(app, /openSettings\(\{ pendingAction: "match-override" \}\)/);
  assert.match(app, /resumeMatchOverride/);
  assert.match(app, /settingsDialog\.close\(\)/);
  assert.match(app, /await openMatchOverrideEditor\(\)/);
  assert.match(app, /Administrator access is required to edit match details/);
  assert.match(app, /canManageMatches/);
  assert.match(app, /Manual override/);
});


test("Saturday free pickup is visually distinct and never exposes RSVP controls", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(app, /game\.kind === "free_pickup"/);
  assert.match(app, /\? "Free Pickup"/);
  assert.match(app, /rsvp: game\.kind === "pickup"/);
  assert.match(app, /hasCapacity = game\.kind === "pickup"/);
});


test("match override modal is independently centered and constrained", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(
    css,
    /\.match-override-dialog \{[\s\S]*width:\s*min\(34rem, calc\(100vw - 1\.25rem\)\);[\s\S]*margin:\s*auto;[\s\S]*padding:\s*0;/,
  );
  assert.match(
    css,
    /\.match-override-shell \{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*box-sizing:\s*border-box;/,
  );
  assert.match(css, /\.match-override-form input \{[\s\S]*width:\s*100%;[\s\S]*box-sizing:\s*border-box;/);
});

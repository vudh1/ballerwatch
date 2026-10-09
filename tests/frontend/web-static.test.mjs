import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("GitHub Pages PWA has installable project-path manifest and service worker", () => {
  const manifest = JSON.parse(fs.readFileSync("frontend/web/manifest.webmanifest", "utf8"));
  assert.equal(manifest.start_url, "/ballerwatch/");
  assert.equal(manifest.scope, "/ballerwatch/");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  assert.equal(fs.existsSync("frontend/web/apple-touch-icon.png"), true);

  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-touch-icon\.png\?v=8\.1\.1/);
  assert.match(html, /class="brand-icon"/);
  assert.match(html, /icon\.svg\?v=8\.1\.1/);
  assert.match(html, /Push notifications/);
  assert.match(html, /id="notification-bell"/);
  assert.match(html, /id="notification-dialog"/);
  assert.match(html, /styles\.css\?v=8\.1\.1/);
  assert.match(html, /app\.js\?v=8\.1\.1/);

  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /ballerwatch-v8-1-1-shell/);
});

test("static web app contains no repository secrets or private runtime data", () => {
  const files = [
    "frontend/web/index.html",
    "frontend/web/launch-prepaint.js",
    "frontend/web/app.js",
    "frontend/web/sw.js",
    "frontend/web/styles.css",
    "frontend/web/manifest.webmanifest",
    "frontend/web/icon.svg",
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
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(app, /els\.installCard\?\.remove\(\)/);
  assert.match(app, /notificationDialog\.showModal\(\)/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});




test("Home Screen install prompt uses the same card layout system as dashboard cards", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(html, /class="card footer-install" id="install-card"/);
  assert.match(html, /class="footer-install-copy"/);
  assert.match(css, /\.footer-install\.card \{[\s\S]*padding:\s*clamp/);
  assert.match(css, /\.footer-install\.card \{[\s\S]*border-radius:\s*30px/);
});

test("promotion watches Worker and Pages then refreshes the open PWA", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(app, /async function watchPromotedRelease/);
  assert.match(app, /async function deployedAppVersion/);
  assert.match(app, /\/web\/config/);
  assert.match(app, /index\.html\?release=/);
  assert.match(app, /html\.includes\(\`app\.js\?v=\$\{expected\}\`\)/);
  assert.match(app, /void watchPromotedRelease\(version\)/);
  assert.match(app, /BallerWatch \$\{expected\} is live\. Refreshing this app/);
  assert.match(app, /window\.location\.reload\(\)/);
});

test("installed PWA aggressively revalidates release assets", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");
  assert.match(app, /sw\.js\?v=8\.1\.1/);
  assert.match(app, /updateViaCache:\s*"none"/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /controllerchange/);
  assert.match(sw, /cache:\s*"no-store"/);
});


test("notification bell exposes a synchronized push switch", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
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


test("pickup capacity sheet owns RSVP while the card keeps secondary actions", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(html, /id="next-game-card"/);
  assert.doesNotMatch(html, /id="next-game-rsvp"/);
  assert.match(html, /id="rsvp-roster-rsvp"/);
  assert.match(html, /id="next-game-directions"/);
  assert.match(html, /id="next-game-share"/);
  assert.match(app, /function applyRsvpAction/);
  assert.match(app, /applyRsvpAction\(els\.rsvpRosterRsvp, spotlightModel\(game, "SELECTED GAME"\)\)/);
  assert.match(app, /\/web\/next-game/);
  assert.match(app, /google\.com\/maps\/search\/\?api=1/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /navigator\.clipboard\.writeText/);
});



test("match spotlight shows a subtle source freshness line", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");

  assert.match(html, /id="next-game-updated"/);
  assert.match(app, /function matchUpdatedText/);
  assert.match(app, /hour: "numeric"/);
  assert.match(app, /minute: "2-digit"/);
  const matchUpdated = app.match(/function matchUpdatedText\(value\)[\s\S]*?\n}/)?.[0] || "";
  assert.doesNotMatch(matchUpdated, /month:|day:/);
  assert.doesNotMatch(app, /Manual override", matchUpdatedText/);
  assert.match(app, /game\.sourceUpdatedAt/);
  assert.match(css, /\.match-update-credit \{[\s\S]*color:\s*#64748b;[\s\S]*font-size:\s*var\(--type-caption\)/);
  assert.match(worker, /pickup\/state\/source-health\.json/);
  assert.match(worker, /sourceUpdatedAt:/);
});

test("right waterfall stays visually full-height while its hit area avoids match actions", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const waterfall = css.split(
    "/* v7.0.26 full-height right waterfall with a reserved action hit zone */",
  )[1] || "";

  assert.match(
    waterfall,
    /\.spotlight-edge-next \{[\s\S]*top:\s*5\.75rem;[\s\S]*overflow:\s*visible;/,
  );
  assert.match(
    waterfall,
    /\.spotlight-edge-next::before \{[\s\S]*top:\s*-5\.75rem;[\s\S]*bottom:\s*0;[\s\S]*pointer-events:\s*none;/,
  );
  assert.ok(
    css.lastIndexOf("/* v7.0.26 full-height right waterfall with a reserved action hit zone */")
      > css.lastIndexOf("/* v7.0.25 preserve match-type action priority over desktop carousel edge */"),
  );
});

test("desktop match-type action keeps priority over the final carousel edge rule", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const priorityBlock = css.split(
    "/* v7.0.25 preserve match-type action priority over desktop carousel edge */",
  )[1] || "";

  assert.match(
    priorityBlock,
    /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.spotlight-edge-next \{[\s\S]*top:\s*5\.75rem;/,
  );
  assert.ok(
    css.lastIndexOf("/* v7.0.25 preserve match-type action priority over desktop carousel edge */")
      > css.lastIndexOf(".spotlight-edge-control {\n    top: 0;"),
  );
});

test("pickup match card uses a clear non-pill action hierarchy", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const hierarchy = css.split("/* v7.0.24 clearer match-card action hierarchy */")[1] || "";

  assert.match(
    hierarchy,
    /\.match-card-menu-trigger\.status-dot \{[\s\S]*border-radius:\s*12px;[\s\S]*font-size:\s*0\.68rem;/,
  );
  assert.match(
    hierarchy,
    /\.next-game-weather \{[\s\S]*padding:\s*0;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    hierarchy,
    /\.next-game-rsvp-pill \{[\s\S]*min-height:\s*3rem;[\s\S]*border-radius:\s*14px;[\s\S]*font-weight:\s*800;/,
  );
  assert.match(
    hierarchy,
    /\.pickup-rsvp-link \{[\s\S]*rgba\(51, 65, 85, 0\.34\)[\s\S]*!important;/,
  );
  assert.match(
    hierarchy,
    /\.pickup-rsvp-link\.is-confirmed \{[\s\S]*rgba\(34, 197, 94, 0\.92\)[\s\S]*!important;/,
  );
  assert.match(
    hierarchy,
    /\.next-game-actions \.button-link,[\s\S]*\.next-game-actions button \{[\s\S]*min-height:\s*2\.8rem;[\s\S]*border-radius:\s*12px;[\s\S]*box-shadow:\s*none;/,
  );
});

test("pickup RSVP button is neutral until authenticated confirmation is known", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(app, /confirmedRsvpDates = new Set/);
  assert.match(app, /model\.rsvpConfirmed \? "RSVP'd" : "RSVP"/);
  assert.match(app, /rsvpRosterRsvp: document\.querySelector\("#rsvp-roster-rsvp"\)/);
  assert.doesNotMatch(app, /nextGameRsvp: document\.querySelector/);
  assert.match(css, /\.pickup-rsvp-link \{[\s\S]*rgba\(71, 85, 105, 0\.36\)/);
  assert.match(css, /\.pickup-rsvp-link\.is-confirmed \{[\s\S]*rgba\(74, 222, 128/);
  assert.match(css, /\.pickup-rsvp-link\.is-confirmed::before \{[\s\S]*content:\s*"✓"/);
});

test("notification test is local and service-worker driven", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");
  assert.match(html, /id="test-notification"/);
  assert.match(app, /ballerwatch:test-notification/);
  assert.match(app, /delayMs:\s*5_000/);
  assert.match(sw, /self\.addEventListener\("message"/);
  assert.match(sw, /Test notification/);
  assert.match(sw, /showNotification/);
});


test("main page keeps push controls inside the bell only and install help in the footer", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  assert.match(html, /<footer>[\s\S]*id="install-card"[\s\S]*id="version"/);
  assert.match(html, /id="bell-push-toggle"/);
  assert.doesNotMatch(html, /id="enable-push"/);
  assert.doesNotMatch(html, /id="disable-push"/);
  assert.doesNotMatch(html, /id="settings"/);
});

test("question box supports slash commands and autosuggestions", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(html, /id="question-suggestions"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /\/ commands|[Tt]ype <strong>\/<\/strong> for commands/);
  assert.match(app, /COMMAND_SUGGESTIONS/);
  assert.match(app, /BASE_QUESTION_COMPLETIONS/);
  assert.match(app, /ArrowDown/);
  assert.match(app, /ArrowUp/);
  assert.match(app, /activeSuggestionIndex/);
});


test("app-facing copy is web-only", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const manifest = fs.readFileSync("frontend/web/manifest.webmanifest", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const client = fs.readFileSync("frontend/web/lib/client.js", "utf8");
  assert.doesNotMatch(html, /https:\/\/t\.me\//i);
  assert.doesNotMatch(app, /\/web\/user\/pair/);
  assert.match(client, /https:\/\/ballerwatch-web\.vudhone\.workers\.dev/);
  assert.doesNotMatch(manifest, /chat|messaging adapter/i);
});


test("user settings support password-only sign-in with repository recovery", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
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

  const client = fs.readFileSync("frontend/web/lib/client.js", "utf8");
  assert.match(client, /ballerwatch-owner-token/);
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
  assert.match(recovery, /node backend\/shared\/user-recovery\.mjs reset/);
  assert.match(recovery, /node backend\/shared\/runtime-state\.mjs pull user/);
  assert.match(recovery, /node backend\/shared\/runtime-state\.mjs push user/);
});

test("notification test control is deliberately subtle", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(html, /class="subtle-action" id="test-notification"/);
  assert.match(css, /\.subtle-action/);
  assert.doesNotMatch(html, /secondary" id="test-notification"/);
});



test("answer feedback is gesture-only, answer-scoped, and persists directly through the web runtime", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");

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
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const paths = fs.readFileSync("backend/shared/runtime-paths.mjs", "utf8");
  const summary = fs.readFileSync("backend/shared/feature-request-summary.mjs", "utf8");

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
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");

  assert.match(app, /intent: payload\.intent \|\| ""/);
  assert.match(worker, /intent: cleanText\(event\.intent, 60\)/);
  assert.match(worker, /Deterministic review fallback used because AI compaction was unavailable/);
  assert.match(worker, /source: entry\.source/);
  assert.match(worker, /intent: entry\.intent/);
});

test("Ask BallerWatch keeps RATS history follow-up context", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(app, /What is the RATS record for a team\?/);
  assert.match(app, /Have two RATS teams played each other before\?/);
  assert.match(app, /ballerwatch-last-rats-teams/);
  assert.match(app, /lastHistoryTeams:/);
  assert.match(app, /payload\.historyTeams/);
});

test("question autocomplete predicts full sentences from typed prefixes", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
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
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.hero-actions \{[^}]*flex-direction:\s*row;/);
  assert.match(css, /\.hero-actions \{[^}]*display:\s*flex;/);
});



test("password recovery is admin-controlled, temporary-secret based, and revokes sessions", () => {
  const recovery = fs.readFileSync(".github/workflows/reset-user-password.yml", "utf8");
  const helper = fs.readFileSync("backend/shared/user-recovery.mjs", "utf8");

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
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const watchdog = fs.readFileSync(".github/workflows/watchdog.yml", "utf8");

  assert.match(html, /id="two-week-calendar"/);
  assert.match(html, /id="calendar-grid"/);
  assert.doesNotMatch(html, /Open-Meteo/);
  assert.doesNotMatch(html, /OpenStreetMap contributors/);
  assert.match(app, /\/web\/calendar/);
  assert.match(app, /weatherSummary/);
  assert.match(css, /\.calendar-grid/);
  assert.match(css, /\.spotlight-card/);
  assert.match(css, /\/\* v5 dashboard \*\//);
  assert.match(watchdog, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(watchdog, /node backend\/weather\/update\.mjs/);
});

test("calendar rolls by week with spotlight navigation and expands through the latest match week", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

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
  const schedules = fs.readFileSync("backend/infra/external-schedules.mjs", "utf8");
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
  assert.match(pickup, /node backend\/weather\/update\.mjs/);
  assert.match(league, /Refresh weather after league schedule change/);
  assert.match(league, /node backend\/weather\/update\.mjs/);
  assert.match(watchdog, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(watchdog, /node backend\/weather\/update\.mjs/);
});


test("calendar selection reuses the main spotlight instead of a second detail panel", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(html, /id="spotlight-label"/);
  assert.match(html, /id="calendar-game-picker"/);
  assert.doesNotMatch(html, /id="calendar-detail"/);
  assert.match(app, /function selectCalendarDate/);
  assert.match(app, /renderNextGame\(game, "SELECTED GAME"\)/);
  assert.match(app, /nextGameCard\.classList\.add\("spotlight-selected"\)/);
  assert.match(app, /scrollIntoView\(\{ behavior: "smooth"/);
});

test("selected spotlight returns to Next Game after idle interaction timeout", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(app, /SPOTLIGHT_IDLE_RESET_MS = 6_000/);
  assert.match(app, /function scheduleSpotlightIdleReset/);
  assert.match(app, /function resetSpotlightToNextGame/);
  assert.match(app, /selectedCalendarGameId = ""/);
  assert.match(app, /renderNextGame\(nextGame, "NEXT GAME"\)/);
  assert.match(app, /nextGameCard\.classList\.remove\("spotlight-selected"\)/);
  assert.match(app, /document\.querySelector\("dialog\[open\]"\)/);
  assert.match(app, /carousel\.addEventListener\("pointerdown"/);
});

test("supported browsers get a short interaction vibration without requiring it", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(app, /INTERACTION_VIBRATION_MS = 8/);
  assert.match(app, /function pulseInteractionFeedback/);
  assert.match(app, /typeof navigator\.vibrate !== "function"/);
  assert.match(app, /navigator\.vibrate\(INTERACTION_VIBRATION_MS\)/);
  assert.match(app, /function installInteractionFeedback/);
  assert.match(app, /event\.isTrusted/);
});

test("liquid glass visual system has blur, translucent layers, and fallback", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(css, /\/\* v5\.1 liquid glass \*\//);
  assert.match(css, /backdrop-filter:\s*blur\(/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(css, /--glass-fill:/);
  assert.match(css, /@supports not \(\(backdrop-filter:/);
  assert.match(css, /\.calendar-game-choice/);
});


test("typography uses one native system stack and normalized scale", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
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
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(app, /game\.kind === "pickup" && game\.reserved != null/);
  assert.match(app, /\$\{game\.reserved\} \/ \$\{game\.capacity\} reserved/);
  assert.match(app, /capacityText/);
  assert.match(app, /weatherApproximate/);
  assert.match(app, /Seattle-area/);
});


test("installed app refreshes data and release updates automatically", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

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
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
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
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
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
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(app, /let selectedCalendarGameId = ""/);
  assert.match(app, /availableGames\.find\(\(game\) => game\.id === selectedCalendarGameId\)/);
  assert.match(app, /renderNextGame\(selectedGame, "SELECTED GAME"\)/);
});


test("Ask BallerWatch is available from a floating bot dialog with autocomplete", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /id="chat-launcher"/);
  assert.match(html, /id="chat-dialog"/);
  assert.match(html, /id="close-chat"/);
  assert.match(html, /<h2>BallerWatch AI<\/h2>/);
  assert.match(html, /id="question-form"/);
  assert.doesNotMatch(html, /<section class="card ask-card">/);
  assert.match(app, /function openChat/);
  assert.match(app, /chatDialog\.showModal\(\)/);
  assert.match(app, /chatLauncher\?\.addEventListener\("click", openChat\)/);
  assert.match(app, /event\.target === els\.chatDialog/);
  assert.match(css, /\.chat-launcher \{[\s\S]*position:\s*fixed;[\s\S]*right:/);
  assert.match(css, /\.chat-dialog \{[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.chat-dialog-shell \{[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /\.question-input-wrap \{[\s\S]*position:\s*relative;/);
  assert.match(css, /\.question-suggestions \{[\s\S]*position:\s*absolute;/);
});

test("weather refresh is immediate only for schedule-relevant changes", () => {
  const pickup = fs.readFileSync("backend/pickup/update.mjs", "utf8");
  const pickupWorkflow = fs.readFileSync(".github/workflows/pickup.yml", "utf8");
  const leagueWorkflow = fs.readFileSync(".github/workflows/league.yml", "utf8");
  const relevance = fs.readFileSync("backend/weather/relevance.mjs", "utf8");

  assert.match(pickup, /pickupWeatherChanged/);
  assert.match(pickup, /weather-refresh-needed/);
  assert.match(pickupWorkflow, /Refresh weather after pickup schedule change/);
  assert.match(pickupWorkflow, /node backend\/weather\/update\.mjs/);
  assert.match(leagueWorkflow, /Refresh weather after league schedule change/);
  assert.match(leagueWorkflow, /needsCalendar == 'true'/);
  assert.doesNotMatch(relevance, /reserved|capacity|players|waitlist/);
});


test("installed app does not interrupt first-load hydration for a service-worker update", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(app, /let initialLoadComplete = false/);
  assert.match(app, /let appRefreshDeferred = false/);
  assert.match(
    app,
    /if \(!initialLoadComplete\) \{\s*appRefreshDeferred = true;\s*return;\s*\}/,
  );
  assert.match(
    app,
    /await Promise\.all\(\[\s*registerServiceWorker\(\)\.catch\(\(\) => null\),\s*loadConfig\(\),\s*loadBoard\(\),\s*loadCalendar\(\),\s*loadNotificationProfile\(\),\s*\]\);/,
  );
  assert.match(app, /initialLoadComplete = true/);
  assert.match(
    app,
    /if \(appRefreshDeferred && initialLoadComplete\) \{\s*window\.location\.reload\(\);\s*return;\s*\}/,
  );
});


test("notification inbox tracks unread state, opens full-screen detail, and animates swipe delete", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

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

test("installed app icon badge mirrors unread notifications and background push", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");

  assert.match(app, /async function syncAppIconBadge/);
  assert.match(app, /navigator\.setAppBadge\(normalized\)/);
  assert.match(app, /navigator\.clearAppBadge\(\)/);
  assert.match(app, /type: "ballerwatch:badge-count"/);
  assert.match(app, /void syncAppIconBadge\(normalized\)/);

  assert.match(sw, /DEVICE_STATE_CACHE = "ballerwatch-device-state-v1"/);
  assert.match(sw, /async function readBadgeCount/);
  assert.match(sw, /async function incrementAppBadge/);
  assert.match(sw, /self\.navigator\.setAppBadge\(normalized\)/);
  assert.match(sw, /event\.data\?\.type === "ballerwatch:badge-count"/);
  assert.match(sw, /incrementAppBadge\(\)/);
  assert.match(sw, /key !== CACHE && key !== DEVICE_STATE_CACHE/);
});

test("notification push control is compact and only displays On or Off", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /class="push-compact"/);
  assert.doesNotMatch(html, /class="notification-push-row"/);
  assert.match(app, /textContent = enabled \? "On" : "Off"/);
  assert.match(css, /\.switch-compact \.switch-track/);
  assert.match(css, /width:\s*2\.15rem/);
});

test("next-game sharing uses the generic device share sheet", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(html, /id="next-game-share" type="button">Share<\/button>/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /title: "BallerWatch game"/);
  assert.match(app, /Field location copied/);
  assert.doesNotMatch(app, /Choose Tesla in the share sheet/);
  assert.doesNotMatch(app, /https:\/\/ts\.la\/app/);
});



test("app and repository expose explicit BallerWatch copyright notices", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const copyright = fs.readFileSync("COPYRIGHT.md", "utf8");

  assert.match(html, /© 2026 BallerWatch\. All rights reserved\./);
  assert.match(app, /Copyright © 2026 BallerWatch\. All rights reserved\./);
  assert.match(worker, /Copyright © 2026 BallerWatch\. All rights reserved\./);
  assert.match(copyright, /Publication of the source code in a public repository does not by itself grant a license/);
});

test("footer contains no secondary messaging shortcut", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  assert.doesNotMatch(html, /https:\/\/t\.me\//i);
  assert.match(html, /id="install-card"/);
});


test("BallerWatch 7.1.7 uses the top-right bell and gear without bottom app tabs", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="notification-bell"/);
  assert.doesNotMatch(html, /class="app-tabs"/);
  assert.doesNotMatch(html, /id="tab-home"|id="tab-notifications"|id="tab-settings"/);
  assert.doesNotMatch(app, /setActiveAppTab|tabHome|tabNotifications|tabSettings/);
  assert.match(app, /notificationBell\.addEventListener\("click", openNotifications\)/);
  assert.match(app, /settingsButton\.addEventListener\("click", openSettings\)/);
  assert.match(app, /notificationDialog\.showModal\(\)/);
  assert.match(app, /settingsDialog\.showModal\(\)/);
});

test("page uses a soccer-pitch backdrop with readable translucent cards", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(css, /repeating-linear-gradient\([\s\S]*rgba\(34, 197, 94, 0\.055\)/);
  assert.match(css, /body::before \{[\s\S]*border:\s*0;[\s\S]*box-shadow:\s*none/);
  assert.match(css, /body::before \{[\s\S]*radial-gradient\([\s\S]*circle at 50% 50%/);
  const icon = fs.readFileSync("frontend/web/icon.svg", "utf8");
  const manifest = fs.readFileSync("frontend/web/manifest.webmanifest", "utf8");
  assert.match(icon, /A soccer pitch with a soccer ball/);
  assert.match(icon, /<circle cx="256" cy="256" r="54"\/>/);
  assert.match(icon, /translate\(347 344\)/);
  assert.match(manifest, /icon\.svg\?v=8\.1\.1/);
  assert.match(css, /\.card,[\s\S]*\.footer-install \{[\s\S]*rgba\(6, 18, 22, 0\.57\)/);
  assert.match(css, /\.spotlight-card \{[\s\S]*rgba\(4, 16, 22, 0\.72\)/);
  assert.match(css, /backdrop-filter:\s*blur\(24px\) saturate\(135%\)/);
});

test("notification center supports filters, synced read state, and account preferences", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /data-notification-filter="all"/);
  assert.match(html, /data-notification-filter="pickup"/);
  assert.match(html, /data-notification-filter="league"/);
  assert.match(html, /data-notification-filter="version"/);
  assert.match(html, /id="mark-all-notifications-read"/);
  assert.match(html, /id="notification-pref-pickup"/);
  assert.match(html, /id="notification-pref-league"/);
  assert.match(html, /id="notification-pref-version"/);

  assert.match(app, /\/web\/user\/notifications/);
  assert.match(app, /function loadNotificationProfile/);
  assert.match(app, /function persistNotificationProfile/);
  assert.match(app, /function markAllNotificationsRead/);
  assert.match(app, /persistDeletedNotifications\(allVisible\)/);
  assert.match(app, /localNotificationProfile\(\)/);
  assert.match(app, /clearLocalNotificationProfile\(\)/);
  assert.match(worker, /userRoute\(url\.pathname, "notifications"\)/);
  assert.match(worker, /notificationProfiles/);
  assert.match(worker, /runtime\(user\): sync notification profile/);
  assert.match(css, /\.notification-filters \{/);
  assert.match(css, /\.notification-preferences \{/);
  assert.match(html, /<span>App update<\/span>/);
  assert.match(css, /\.notification-preference-options \{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(app, /const notificationProfileRefresh = ownerToken\(\)/);
  assert.match(app, /loadNotificationProfile\(\{ migrateLocal: false \}\)/);
  assert.match(app, /const \[calendarOk, boardOk\] = await Promise\.all/);
  assert.match(app, /await notificationProfileRefresh/);
  assert.match(app, /Synced when active for @/);
});

test("match spotlight swipe uses connected neighboring cards like a carousel train", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

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
  assert.match(app, /const trainGeometry = \(\) =>/);
  assert.match(app, /const cardRect = current\.getBoundingClientRect\(\)/);
  assert.match(app, /left:\s*current\.offsetLeft/);
  assert.match(app, /top:\s*current\.offsetTop/);
  assert.match(app, /distance:\s*width \+ gap\(\)/);
  assert.match(app, /preview\.style\.left = `\$\{geometry\.left\}px`/);
  assert.match(app, /preview\.style\.top = `\$\{geometry\.top\}px`/);
  assert.match(app, /preview\.style\.width = `\$\{geometry\.width\}px`/);
  assert.match(app, /preview\.style\.height = `\$\{geometry\.height\}px`/);
  assert.doesNotMatch(app, /carousel\.clientWidth \+ gap\(\)/);
  assert.match(app, /committedTrain\.preview\.style\.transform = "translate3d\(0, 0, 0\)"/);
  assert.match(app, /selectCalendarDate\(committedTrain\.target\.date\)/);
  assert.match(app, /document\.documentElement\.classList\.add\("spotlight-swipe-active"\)/);
  assert.match(
    app,
    /button\.setAttribute\("aria-selected", String\(button\.dataset\.date === date\)\)/,
  );
  assert.match(app, /renderCalendarGamePicker\(games, game\.id \|\| ""\)/);
  assert.match(app, /function isSpotlightInteractiveTarget/);
  assert.match(app, /isSpotlightInteractiveTarget\(event\.target\)/);
  assert.match(css, /\/\* v5\.3\.3 connected-card carousel swipe \*\//);
  assert.match(css, /\.spotlight-carousel \{[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /--spotlight-train-gap:\s*0px/);
  assert.match(
    css,
    /\.spotlight-carousel \.spotlight-card\.spotlight-train-card \{[\s\S]*position:\s*absolute;/,
  );
  assert.match(css, /\.spotlight-card \{[\s\S]*position:\s*relative;/);
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
  assert.match(
    css,
    /\.spotlight-edge-next \{[\s\S]*top:\s*4\.6rem;[\s\S]*right:\s*0;/,
  );
  assert.match(css, /\.match-card-menu-wrap \{[\s\S]*position:\s*relative;/);
});


test("v5.5 dashboard matches the iPhone-first demo direction", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /Pickup \+ RATS monitor/);
  assert.match(html, /<h2 id="calendar-title">14-Day Calendar<\/h2>/);
  assert.match(html, /id="chat-launcher"/);
  assert.match(html, /<h2>BallerWatch AI<\/h2>/);
  assert.match(html, /id="next-game-capacity"/);
  assert.match(app, /capacityPercent/);
  assert.match(app, /spotsText/);
  assert.match(app, /title: game\.dateLabel \|\| game\.title/);
  assert.match(css, /\/\* v5\.5 iPhone dashboard visual refresh \*\//);
  assert.match(css, /\.spotlight-content \{[\s\S]*grid-template-areas:/);
  assert.match(css, /\.next-game-capacity-track/);
  assert.match(css, /\.calendar-day\[aria-selected="true"\]/);
  assert.match(css, /\.notification-dialog \{[\s\S]*position:\s*fixed;/);
  assert.match(css, /\.chat-launcher \{[\s\S]*position:\s*fixed;/);
});

test("installed iPhone mode adds a blurred status-area separation layer", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

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
  const schedules = fs.readFileSync("backend/infra/external-schedules.mjs", "utf8");

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
  const stateCrypto = fs.readFileSync("backend/shared/state-crypto.mjs", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const client = fs.readFileSync("frontend/web/lib/client.js", "utf8");
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
  assert.match(client, /https:\/\/ballerwatch-web\.vudhone\.workers\.dev/);
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
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");

  assert.match(deploy, /for scope in user pickup league watchdog weather web/);
  assert.match(deploy, /node backend\/shared\/runtime-state\.mjs audit/);
  assert.match(watchdog, /Audit runtime-state encryption/);
  assert.match(watchdog, /node backend\/shared\/runtime-state\.mjs audit/);
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

test("BallerWatch 7 splits transport and notification persistence out of the PWA shell", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const client = fs.readFileSync("frontend/web/lib/client.js", "utf8");
  const state = fs.readFileSync("frontend/web/lib/notification-state.js", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");

  assert.match(app, /from "\.\/lib\/client\.js"/);
  assert.match(app, /from "\.\/lib\/notification-state\.js"/);
  assert.match(client, /export async function requestJson/);
  assert.match(client, /export function clearSession/);
  assert.match(state, /export function normalizedNotificationProfile/);
  assert.match(state, /export function localNotificationProfile/);
  assert.match(sw, /"\.\/lib\/client\.js"/);
  assert.match(sw, /"\.\/lib\/notification-state\.js"/);
});

test("PWA declares restrictive document policy and confines notification navigation", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");
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
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
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
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  assert.match(readme, /!\[BallerWatch animated demo[^\]]*\]\(docs\/demo\.gif\)/);
  assert.equal(fs.readFileSync("docs/demo.gif").subarray(0, 6).toString(), "GIF89a");
  assert.match(html, /id="owner-login-username"/);
  assert.match(html, /id="user-management"/);
  assert.match(html, /id="user-create-form"/);
  assert.match(app, /\/web\/user\/users/);
  assert.match(app, /OWNER_USERNAME_KEY/);
  assert.match(app, /canManageUsers/);
});


test("match override editor uses the type pill action sheet and local Reset", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /id="match-override-dialog" class="match-override-dialog"/);
  assert.match(html, /id="match-override-reset"/);
  assert.match(html, />Reset<\/button>/);
  assert.doesNotMatch(html, /id="next-game-edit"/);
  assert.match(html, /<span id="version">BallerWatch<\/span>/);
  assert.match(html, /<button type="submit">Save<\/button>/);
  assert.doesNotMatch(html, /Save override/);

  assert.match(app, /nextGameMenuTrigger\.addEventListener\("click"/);
  assert.match(app, /matchSourceState/);
  assert.match(app, /sourceGameView/);
  assert.match(app, /fillMatchOverrideForm/);
  assert.match(app, /Source values restored locally/);
  assert.match(app, /persistedOverride/);
  assert.match(app, /method: "DELETE"/);
  assert.match(app, /pendingMatchAdminAction/);
  assert.match(app, /matchAdminSettings\("match-override"\)/);
  assert.match(app, /await openSettings\(\{ pendingAction \}\)/);
  assert.match(app, /resumeMatchAction/);
  assert.match(html, /id="next-game-menu-trigger"/);
  assert.match(html, /id="next-game-menu-edit"/);
  assert.match(html, /id="next-game-menu-delete"/);
  assert.doesNotMatch(app, /MATCH_OVERRIDE_DOUBLE_TAP_MS/);
  assert.doesNotMatch(app, /installTouchDoubleTap/);
  assert.doesNotMatch(app, /nextGameCard\.addEventListener\("dblclick"/);
  assert.doesNotMatch(app, /version\.addEventListener\("dblclick"/);

  assert.doesNotMatch(css, /\.match-edit-link/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.match-override-actions button \{[\s\S]*min-height:\s*2\.75rem/);
});


test("Saturday synthetic pickup keeps an internal kind but is labeled simply Pickup", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  assert.match(worker, /kind: "free_pickup"/);
  assert.match(app, /type: game\.kind === "league" \? "League" : "Pickup"/);
  assert.doesNotMatch(app, /Free Pickup/);
  assert.doesNotMatch(worker, /Free Pickup/);
  assert.match(app, /rsvp: game\.kind === "pickup"/);
  assert.match(app, /hasCapacity = game\.kind === "pickup"/);
});


test("match override modal is independently centered and constrained", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
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


test("admin Settings presents production rollout only as an app update", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");

  assert.match(html, /id="release-management"/);
  assert.match(html, /id="promote-release"/);
  assert.match(html, />App update</);
  assert.match(html, /validated app-update workflow/);
  assert.match(app, /function renderReleaseStatus/);
  assert.match(app, /async function loadReleaseStatus/);
  assert.match(app, /async function promoteProductionRelease/);
  assert.match(app, /\/web\/user\/release-status/);
  assert.match(app, /\/web\/user\/promote-release/);
  assert.match(app, /Production \$\{production\} → Available \$\{source\}/);
  assert.match(app, /promoteRelease\.textContent = "App update"/);
  assert.match(app, /Start the BallerWatch \$\{version\} app update/);
  assert.match(app, /normal validation and release gates will still apply/);
  assert.doesNotMatch(app, /Promote BallerWatch|Promotion requested|Requesting production promotion|Promotion is still deploying/);

  assert.match(worker, /userRoute\(url\.pathname, "release-status"\)/);
  assert.match(worker, /userRoute\(url\.pathname, "promote-release"\)/);
  assert.match(worker, /account\.role !== "admin"/);
  assert.match(worker, /App update started for BallerWatch/);
  assert.match(worker, /Unable to start the app update right now/);
  assert.match(worker, /githubFile\(env, "features\/versions\.json", "main"\)/);
  assert.match(worker, /githubFile\(env, "features\/versions\.json", PRODUCTION_REF\)/);
  assert.match(worker, /dispatchWorkflow\(env, "promote-release\.yml", \{\}, "main"\)/);
  assert.match(worker, /async function dispatchWorkflow\(env, workflow, inputs = \{\}, ref = PRODUCTION_REF\)/);
});


test("match type pill opens a touch-safe Edit/Delete action sheet and freshness stays in footer", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(html, /id="next-game-menu-trigger"/);
  assert.match(html, /id="next-game-menu-edit"/);
  assert.match(html, /id="next-game-menu-delete"/);
  assert.match(html, /id="deleted-match-management"/);
  assert.match(app, /toggleMatchCardMenu/);
  assert.match(app, /deleteSelectedMatch/);
  assert.match(app, /restoreDeletedMatch/);
  assert.match(app, /\/web\/user\/match/);
  assert.match(html, /class="match-card-action-dialog"/);
  assert.doesNotMatch(html, /match-card-menu-glyph/);
  assert.match(app, /nextGameMenu\.showModal\(\)/);
  assert.match(app, /event\.target === els\.nextGameMenu/);
  assert.match(app, /function isSpotlightInteractiveTarget/);
  assert.match(app, /\[role=button\]/);
  assert.match(app, /type: game\.kind === "league" \? "League" : "Pickup"/);
  assert.match(css, /\.match-card-action-dialog \{/);
  assert.match(css, /"location weather"[\s\S]*"capacity rsvp"/);
  assert.match(css, /\.next-game-rsvp-pill \{[\s\S]*grid-area:\s*rsvp/);
  assert.match(css, /\.spotlight-content \{[\s\S]*padding-bottom:\s*2\.2rem/);
  assert.match(
    html,
    /id="next-game-hint"><\/p>\s*<\/div>\s*<div class="match-card-footer">\s*<p class="match-update-credit" id="next-game-updated"><\/p>/,
  );
  assert.match(css, /\.spotlight-card \{[\s\S]*--spotlight-card-inset:\s*clamp\(1\.35rem, 4vw, 1\.8rem\);[\s\S]*padding:\s*var\(--spotlight-card-inset\)/);
  assert.match(css, /\.match-card-footer \{[\s\S]*position:\s*absolute;[\s\S]*right:\s*var\(--spotlight-card-inset[\s\S]*bottom:\s*0\.45rem;[\s\S]*left:\s*var\(--spotlight-card-inset[\s\S]*min-height:\s*0;[\s\S]*padding-top:\s*0\.42rem/);
  assert.match(css, /\.match-card-footer \{[\s\S]*border-top:\s*0;/);
  assert.match(css, /\.match-card-footer \.match-update-credit[\s\S]*font-size:\s*0\.56rem[\s\S]*color:\s*rgba\(148, 163, 184, 0\.46\)[\s\S]*text-align:\s*right/);
});

test("calendar weather freshness sits in a subtle card footer without page watermark", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.match(
    html,
    /<div class="calendar-card-footer">\s*<p class="calendar-updated calendar-update-credit" id="calendar-updated">Updated pending<\/p>/,
  );
  assert.match(css, /\.calendar-card-footer \{[\s\S]*position:\s*absolute;[\s\S]*bottom:\s*0\.42rem;[\s\S]*border-top:\s*0;/);
  assert.match(css, /\.calendar-card-footer \.calendar-update-credit \{[\s\S]*font-size:\s*0\.56rem;/);
  assert.match(css, /\.calendar-card-footer \.calendar-update-credit \{[\s\S]*color:\s*rgba\(148, 163, 184, 0\.46\)/);
  assert.doesNotMatch(html, /class="data-attribution"/);
  assert.doesNotMatch(html, /Weather by|Open-Meteo|OpenStreetMap contributors/);
  assert.doesNotMatch(html, /class="weather-credit"/);
  assert.doesNotMatch(app, /Weather updated/);
  assert.match(app, /Updated pending/);
  assert.equal(fs.existsSync("docs/demo_failed.jpg"), false);
  assert.equal(fs.existsSync("docs/demo_failed 1.jpg"), false);
});

test("release deploy refreshes weather immediately for newly generated match cards", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy-worker.yml", "utf8");
  assert.match(workflow, /Refresh match weather for released schedule/);
  assert.match(workflow, /node backend\/shared\/runtime-state\.mjs pull weather/);
  assert.match(workflow, /node backend\/weather\/update\.mjs/);
  assert.match(workflow, /node backend\/shared\/runtime-state\.mjs push weather/);
});


test("safe feedback review tooling never reads raw private chat or request text", () => {
  const script = fs.readFileSync("scripts/review-feedback.mjs", "utf8");
  const workflow = fs.readFileSync(".github/workflows/review-feedback.yml", "utf8");

  assert.match(script, /state\/chat-review\.json/);
  assert.match(script, /requests\/unknown\.json/);
  assert.doesNotMatch(script, /state\/chat-history\.json/);
  assert.doesNotMatch(script, /requests\/private\.json/);
  assert.match(script, /kind: String\(signal\?\.kind/);
  assert.match(script, /summary: String\(signal\?\.summary/);
  assert.match(script, /reason: String\(signal\?\.reason/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref: runtime-state/);
  assert.match(workflow, /TRACKER_STATE_KEY: \$\{\{ secrets\.TRACKER_STATE_KEY \}\}/);
});


test("cinematic launch owns first paint, stays session-scoped, and is reduced-motion safe", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const gate = fs.readFileSync("frontend/web/launch-prepaint.js", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const sw = fs.readFileSync("frontend/web/sw.js", "utf8");

  assert.match(html, /<html lang="en" class="launch-intro-pending">/);
  assert.match(html, /<script src="\.\/launch-prepaint\.js\?v=8\.1\.1"><\/script>[\s\S]*<link rel="stylesheet"/);
  assert.match(html, /id="launch-intro" aria-hidden="true">/);
  assert.doesNotMatch(html, /id="launch-intro"[^>]*\shidden/);
  assert.match(html, /class="launch-intro-word-main">BallerWatch<\/span>/);
  assert.match(html, /launch-intro-beam-a/);
  assert.match(gate, /ballerwatch-intro-seen-v1/);
  assert.match(gate, /sessionStorage\.getItem\(introSessionKey\)/);
  assert.match(gate, /prefers-reduced-motion: reduce/);
  assert.match(gate, /classList\.remove\("launch-intro-pending"\)/);
  assert.match(app, /INTRO_SESSION_KEY = "ballerwatch-intro-seen-v1"/);
  assert.match(app, /LAUNCH_INTRO_VISIBLE_MS = 2_250/);
  assert.match(app, /function playLaunchIntro/);
  assert.match(app, /sessionStorage\.getItem\(INTRO_SESSION_KEY\)/);
  assert.match(app, /sessionStorage\.setItem\(INTRO_SESSION_KEY, "1"\)/);
  assert.match(app, /clearLaunchIntroPaintGate\(\)/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(css, /html\.launch-intro-pending \.launch-intro \{[\s\S]*opacity:\s*1;[\s\S]*visibility:\s*visible;[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /@keyframes ballerwatch-intro-word/);
  assert.match(css, /@keyframes ballerwatch-intro-shine/);
  assert.match(css, /\.launch-intro\.is-active \{[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.launch-intro \{[\s\S]*display:\s*none !important/);
  assert.match(sw, /\.\/launch-prepaint\.js\?v=8\.1\.1/);
  assert.doesNotMatch([html, gate, app, css].join("\n"), /Netflix/i);
});

test("music is an icon-only opt-in control and remains gesture-safe", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /class="icon-button music-icon-toggle" id="music-toggle"/);
  assert.match(html, /class="music-speaker"/);
  assert.match(html, /class="music-wave music-wave-one"/);
  assert.match(html, /class="music-slash"/);
  assert.match(html, /id="music-status" aria-live="polite"/);
  assert.doesNotMatch(html, /<h3[^>]*>Experience<\/h3>|Original BallerWatch ambient soundtrack/);
  assert.match(css, /\.music-icon-toggle\.is-on \.music-wave \{[\s\S]*display:\s*block/);
  assert.match(css, /\.music-icon-toggle\.is-on \.music-slash \{[\s\S]*display:\s*none/);
  assert.match(app, /MUSIC_ENABLED_KEY = "ballerwatch-music-enabled-v1"/);
  assert.match(app, /localStorage\.getItem\(MUSIC_ENABLED_KEY\)/);
  assert.match(app, /setAttribute\(\s*"aria-label",[\s\S]*Turn music off[\s\S]*Turn music on/);
  assert.match(app, /document\.addEventListener\("pointerdown", startMusicFromGesture/);
  assert.match(app, /musicToggle\?\.addEventListener\("click"/);
  assert.match(app, /function playStadiumKick/);
  assert.match(app, /function playStadiumClap/);
  assert.match(app, /function playStadiumBrass/);
  assert.match(app, /const stadiumHook = \[/);
  assert.match(app, /createBuffer\(1, frameCount, context\.sampleRate\)/);
  assert.match(app, /Stadium music is playing quietly/);
  assert.doesNotMatch(html, /<audio|autoplay/i);
  assert.doesNotMatch(app, /new Audio\(|createMediaElementSource|\.mp3|\.wav|\.ogg/i);
});


test("settings modal has one visible vertical scroll container", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(html, /id="settings-dialog" class="settings-dialog"/);
  assert.match(css, /\.settings-dialog \{[\s\S]*padding:\s*0;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.settings-dialog \.dialog-shell \{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /html:has\(\.settings-dialog\[open\]\)[\s\S]*overflow:\s*hidden;/);
});


test("iPhone Settings and Notifications share a symmetric safe vertical frame", () => {
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");

  assert.match(css, /--iphone-modal-frame-inset:\s*max\([\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-bottom/);
  assert.match(
    css,
    /\.notification-dialog,\s*\n\s*\.settings-dialog \{[\s\S]*top:\s*var\(--iphone-modal-frame-inset\);[\s\S]*bottom:\s*var\(--iphone-modal-frame-inset\);/,
  );
  assert.match(
    css,
    /\.notification-dialog,\s*\n\s*\.settings-dialog \{[\s\S]*transform:\s*translateX\(-50%\);/,
  );
  assert.match(
    css,
    /\.notification-dialog \.dialog-shell,\s*\n\s*\.settings-dialog \.dialog-shell \{[\s\S]*height:\s*100%;[\s\S]*max-height:\s*none;/,
  );
});


test("notification reader returns to Inbox as a real modal layer", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.ok(app.includes("if (els.notificationReader.open) els.notificationReader.close();"));
  assert.ok(app.includes("if (!els.notificationDialog.open) els.notificationDialog.showModal();"));
  assert.ok(!app.includes("els.notificationDialog.show();"));
  assert.ok(app.includes('els.notificationReader.addEventListener("cancel", (event) => {'));
  assert.ok(app.includes("event.preventDefault();\n  closeNotificationReader();"));
});

test("league workflow writes notifications to the shared root before Web Push", () => {
  const workflow = fs.readFileSync(".github/workflows/league.yml", "utf8");
  const notifications = fs.readFileSync("backend/shared/web-notifications.mjs", "utf8");
  const leagueNotify = fs.readFileSync("backend/league/web-notify.mjs", "utf8");

  assert.match(
    workflow,
    /Record league web notifications[\s\S]*BALLERWATCH_WEB_STATE_ROOT:\s*\.\.[\s\S]*node \.\.\/backend\/league\/web-notify\.mjs/,
  );
  assert.match(notifications, /rootDir = "\."/);
  assert.match(notifications, /path\.resolve\(rootDir, file\)/);
  assert.match(notifications, /path\.resolve\(rootDir, "\.runtime"\)/);
  assert.match(leagueNotify, /loadWebNotificationChannel\("league", \{ rootDir: webStateRoot\(\) \}\)/);
  assert.match(leagueNotify, /deliveredTags\.has\(leagueReminderTag\(key\)\)/);
});


test("pickup RSVP roster empty-state uses normalized entry variables", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(
    app,
    /if \(!confirmedEntries\.length && !queuedEntries\.length\) \{[\s\S]*No RSVP names are available yet/,
  );
  assert.doesNotMatch(app, /if \(!players\.length && !waitlist\.length\)/);
});

test("iPhone spotlight swipe preserves taps on ARIA button controls", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(
    app,
    /function isSpotlightInteractiveTarget\(target\)[\s\S]*\[role=button\][\s\S]*input[\s\S]*select[\s\S]*textarea[\s\S]*label/,
  );
  assert.match(
    app,
    /nextGameCard\.addEventListener\("touchstart",[\s\S]*isSpotlightInteractiveTarget\(event\.target\)/,
  );
  assert.match(
    app,
    /nextGameCard\.addEventListener\("touchmove",[\s\S]*isSpotlightInteractiveTarget\(event\.target\)/,
  );
  assert.match(
    app,
    /nextGameCard\.addEventListener\("touchend",[\s\S]*isSpotlightInteractiveTarget\(event\.target\)/,
  );
  assert.match(app, /nextGameCapacity\.addEventListener\("click",[\s\S]*openRsvpRoster/);
});

test("closing a pointer-opened RSVP roster clears the lingering capacity focus ring", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");

  assert.match(app, /let rsvpRosterOpenedByPointer = false/);
  assert.match(
    app,
    /nextGameCapacity\.addEventListener\("click",[\s\S]*rsvpRosterOpenedByPointer = true[\s\S]*openRsvpRoster/,
  );
  assert.match(
    app,
    /nextGameCapacity\.addEventListener\("keydown",[\s\S]*rsvpRosterOpenedByPointer = false[\s\S]*openRsvpRoster/,
  );
  assert.match(
    app,
    /rsvpRosterDialog\.addEventListener\("close",[\s\S]*requestAnimationFrame\(\(\) => els\.nextGameCapacity\.blur\(\)\)[\s\S]*rsvpRosterOpenedByPointer = false/,
  );
});

test("pickup capacity opens a full-width signed-in RSVP roster without public name leakage", () => {
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const pickupUpdate = fs.readFileSync("backend/pickup/update.mjs", "utf8");

  assert.match(
    html,
    /id="next-game-capacity" role="button" tabindex="0"[\s\S]*aria-haspopup="dialog"/,
  );
  assert.match(html, /id="rsvp-roster-dialog" class="rsvp-roster-dialog"/);
  assert.match(html, /id="rsvp-roster-confirmed-list"/);
  assert.match(html, /id="rsvp-roster-waitlist-list"/);
  assert.match(html, /id="rsvp-roster-rsvp"[\s\S]*>RSVP<\/a>/);

  assert.match(app, /async function openRsvpRoster/);
  assert.match(app, /\/web\/user\/rsvp-roster\?date=/);
  assert.match(app, /headers:\s*ownerHeaders\(\)/);
  assert.match(app, /event\.target === els\.rsvpRosterDialog/);
  assert.match(app, /Sign in to view RSVP names/);
  assert.match(app, /a, button, \[tabindex\]/);

  const rosterSheet = css.split("/* v7.0.25 full-width RSVP roster sheet */")[1] || "";
  assert.match(
    rosterSheet,
    /\.rsvp-roster-dialog \{[\s\S]*width:\s*min\(var\(--app-surface-width\), calc\(100vw - 2rem\)\)/,
  );
  assert.match(rosterSheet, /\.rsvp-roster-actions \{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;/);
  assert.match(rosterSheet, /"capacity capacity"/);
  assert.match(css, /\.rsvp-roster-dialog::backdrop/);
  assert.match(css, /\.next-game-capacity\[role="button"\]/);

  assert.match(worker, /userRoute\(url\.pathname, "rsvp-roster"\)/);
  assert.match(
    worker,
    /userRoute\(url\.pathname, "rsvp-roster"\)[\s\S]*resolveOwnerCapability\(env, bearerToken\(request\)\)/,
  );
  assert.match(worker, /export function pickupRsvpRosterView/);
  assert.match(worker, /players:\s*\[\],[\s\S]*waitlist:\s*\[\]/);

  assert.match(pickupUpdate, /function orderedPrivateRsvpLists/);
  assert.match(pickupUpdate, /previousPrivateState\?\.events\?\.\[date\]/);
  assert.match(pickupUpdate, /firstSeenAt:/);
  assert.match(pickupUpdate, /voteOrder:/);
});

test("share prefers published RATS map links or verified GPS and falls back to Directions lookup", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  const css = fs.readFileSync("frontend/web/styles.css", "utf8");
  assert.ok(app.includes("www.google.com/maps?q="));
  assert.ok(app.includes("latitude.toFixed(6)"));
  assert.ok(app.includes("longitude.toFixed(6)"));
  assert.ok(app.includes("trustedPublishedVenueUrl"));
  assert.ok(app.includes("gpsFromMapsUrl"));
  assert.ok(app.includes("Shared field lookup in Google Maps."));
  assert.ok(app.includes("return { url: googleMapsUrl(query), gps: \"\""));
  assert.ok(app.includes("if (!maps)"));
  assert.ok(worker.includes("webVenueCoordinates(weatherState, weatherById, game)"));
  assert.ok(worker.includes("weatherGame.weatherApproximate !== true"));
  assert.ok(css.includes("right: max(1rem, env(safe-area-inset-right))"));
  assert.ok(css.includes("right: max(0.75rem, env(safe-area-inset-right))"));
});

test("worker retains RATS source links and respects venue overrides for GPS", () => {
  const watcher = fs.readFileSync("backend/league/watcher.mjs", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  assert.ok(watcher.includes("locationUrl: sourceVenueUrl"));
  assert.ok(watcher.includes("venueCoordinates: sourceCoordinates"));
  assert.ok(worker.includes("locationUrl: game?.manualOverride ? \"\""));
  assert.ok(worker.includes("venueCoordinates: game?.manualOverride ? null"));
});


test("new pickup cards show venue pending instead of hiding the match or guessing directions", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const worker = fs.readFileSync("backend/infra/web-worker/worker.mjs", "utf8");
  assert.match(app, /game\.kind === "pickup"\)[\s\S]{0,100}Venue to be announced/);
  assert.match(app, /const capacityKnown = game\.capacity != null && Number\.isFinite\(capacity\)/);
  assert.match(worker, /if \(date < startDate\) continue;\s*const facts = pickupFacts\(safe, date\);/);
  assert.doesNotMatch(worker, /!\(facts\.field && facts\.address\)/);
});

test("BallerWatch AI 8 has match-scoped follow-up context and trust messaging", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const html = fs.readFileSync("frontend/web/index.html", "utf8");
  assert.match(html, /MATCH INTELLIGENCE · V8/);
  assert.match(html, /BallerWatch AI/);
  assert.match(app, /ballerwatch-last-match-key/);
  assert.match(app, /Where is Supermokh FC vs PhoSaiGon/);
});


test("Share sends only the Google Maps field URL, never the fixture summary", () => {
  const app = fs.readFileSync("frontend/web/app.js", "utf8");
  const start = app.indexOf("async function shareNextGame() {");
  const end = app.indexOf("async function scheduleTestNotification()", start);
  assert.ok(start >= 0 && end > start);
  const share = app.slice(start, end);
  assert.match(share, /await navigator\.share\(\{ url: maps \}\)/);
  assert.match(share, /await navigator\.clipboard\.writeText\(maps\)/);
  assert.doesNotMatch(share, /shareText|currentNextGame\.title/);
  assert.doesNotMatch(share, /title:\s*"BallerWatch game"|text:|GPS:/);
  assert.match(share, /const \{ url: maps, source \} = venueShareDetails\(currentNextGame\)/);
});

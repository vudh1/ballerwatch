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
  assert.match(html, /styles\.css\?v=5\.2\.0/);
  assert.match(html, /app\.js\?v=5\.2\.0/);

  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /ballerwatch-v5-2-0-shell/);
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
  assert.match(app, /sw\.js\?v=5\.2\.0/);
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
  assert.match(html, /\/ commands|type <strong>\/<\/strong> for commands/);
  assert.match(app, /COMMAND_SUGGESTIONS/);
  assert.match(app, /QUESTION_COMPLETIONS/);
  assert.match(app, /ArrowDown/);
  assert.match(app, /ArrowUp/);
  assert.match(app, /activeSuggestionIndex/);
});

test("app-facing copy mentions Telegram only for the explicit footer shortcut", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const manifest = fs.readFileSync("docs/manifest.webmanifest", "utf8");
  const withoutFooterShortcut = html.replace(
    /<a href="https:\/\/t\.me\/ttf_rsvp_tracker_bot"[^>]*>Telegram<\/a>/,
    "",
  );
  assert.doesNotMatch(withoutFooterShortcut, /Telegram/i);
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


test("answer supports owner-only double-click feedback toggle and cancellation", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const worker = fs.readFileSync("infra/telegram-webhook/worker.mjs", "utf8");
  const listener = fs.readFileSync("listener/bot.mjs", "utf8");
  const history = fs.readFileSync("shared/chat-history.mjs", "utf8");

  assert.match(html, /id="answer-feedback-status"/);
  assert.match(app, /addEventListener\("dblclick"/);
  assert.match(app, /action: "mark"/);
  assert.match(app, /action: "cancel"/);
  assert.match(app, /double-tap\/click again to cancel/);
  assert.doesNotMatch(app, /startAnswerHold|answerHoldTimer|answerHoldStart/);
  assert.match(worker, /url\.pathname === "\/web\/feedback"/);
  assert.match(worker, /action === "cancel"/);
  assert.match(worker, /action: "cancel-feedback"/);
  assert.match(worker, /hint: "negative_feedback"/);
  assert.match(listener, /removeChatFeedback/);
  assert.match(listener, /event\?\.action === "cancel-feedback"/);
  assert.match(history, /export function removeChatFeedback/);
  assert.match(history, /externalId/);
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


test("owner pairing consumes codes through listener workflow and returns web-safe errors", () => {
  const worker = fs.readFileSync("infra/telegram-webhook/worker.mjs", "utf8");
  const listener = fs.readFileSync("listener/bot.mjs", "utf8");

  const pairFunction = worker.match(/async function pairOwnerDevice[\s\S]*?\n}\n/);
  assert.ok(pairFunction);
  assert.match(pairFunction[0], /dispatchWorkflow\(env, "listener\.yml"/);
  assert.match(pairFunction[0], /action: "consume-pair-code"/);
  assert.doesNotMatch(pairFunction[0], /githubStatePut/);

  assert.match(listener, /event\?\.action === "consume-pair-code"/);
  assert.match(listener, /webPairCodeHash: ""/);
  assert.match(worker, /Pairing service is temporarily unavailable/);
  assert.match(worker, /webJson\([\s\S]*status: 503/);
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


test("weather release bootstrap stays notification-silent", () => {
  const workflow = fs.readFileSync(".github/workflows/weather-refresh.yml", "utf8");
  assert.match(workflow, /push:[\s\S]*weather\/\*\*/);
  assert.match(workflow, /node weather\/update\.mjs/);
  assert.match(workflow, /node shared\/runtime-state\.mjs push weather/);
  assert.doesNotMatch(workflow, /send-pending|sendMessage|telegram-notify|shared\/telegram/i);
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
  assert.match(app, /setSystemState\("live"\)/);
  assert.match(css, /@keyframes ballerwatch-live-pulse/);
  assert.match(css, /\.system-line\.is-live \.system-dot/);
});

test("calendar refresh preserves an explicitly selected future game", () => {
  const app = fs.readFileSync("docs/app.js", "utf8");
  assert.match(app, /let selectedCalendarGameId = ""/);
  assert.match(app, /availableGames\.find\(\(game\) => game\.id === selectedCalendarGameId\)/);
  assert.match(app, /renderNextGame\(selectedGame, "SELECTED GAME"\)/);
});


test("autocomplete stays in document flow instead of overlapping following content", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");
  assert.match(css, /\/\* v5\.1\.4 interaction polish \*\//);
  assert.match(css, /\.question-suggestions \{[\s\S]*position:\s*static;/);
  assert.match(css, /\.ask-card \.question-row \{[\s\S]*align-items:\s*start;/);
  assert.match(css, /\.ask-card \.question-row > button \{[\s\S]*align-self:\s*start;/);
  assert.match(css, /max-height:\s*min\(14rem, 35vh\)/);
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

test("footer offers a Telegram app shortcut", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  assert.match(html, /https:\/\/t\.me\/ttf_rsvp_tracker_bot/);
  assert.match(html, />Telegram<\/a>/);
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
});

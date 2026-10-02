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
  assert.match(html, /styles\.css\?v=5\.6\.0/);
  assert.match(html, /app\.js\?v=5\.6\.0/);

  const sw = fs.readFileSync("docs/sw.js", "utf8");
  assert.match(sw, /self\.addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /ballerwatch-v5-6-0-shell/);
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
  assert.match(app, /sw\.js\?v=5\.6\.0/);
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


test("answer feedback is one-tap, answer-scoped, and does not open owner settings", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");
  const worker = fs.readFileSync("infra/telegram-webhook/worker.mjs", "utf8");
  const listener = fs.readFileSync("listener/bot.mjs", "utf8");
  const history = fs.readFileSync("shared/chat-history.mjs", "utf8");

  assert.match(html, /id="answer-feedback-button"[^>]*>Wrong answer<\/button>/);
  assert.match(html, /id="answer-feedback-status"/);
  assert.match(app, /answerFeedbackButton\.addEventListener\("click"/);
  assert.match(app, /addEventListener\("dblclick"/);
  assert.match(app, /feedbackToken: payload\.feedbackToken \|\| ""/);
  assert.match(app, /feedbackToken: lastAnswerExchange\.feedbackToken \|\| ""/);
  assert.match(app, /action: wasSubmitted \? "cancel" : "mark"/);
  assert.doesNotMatch(
    app.match(/async function toggleWrongAnswerFeedback\(\)[\s\S]*?\n}\n/)?.[0] || "",
    /openSettings\(/,
  );
  assert.match(app, /Feedback expired\. Ask the question again/);
  assert.match(css, /\.answer \{[\s\S]*-webkit-user-select:\s*none;[\s\S]*user-select:\s*none;[\s\S]*-webkit-touch-callout:\s*none;[\s\S]*touch-action:\s*manipulation;/);
  assert.match(app, /addEventListener\("contextmenu", \(event\) => event\.preventDefault\(\)\)/);
  assert.match(app, /addEventListener\("selectstart", \(event\) => event\.preventDefault\(\)\)/);
  assert.match(worker, /export async function issueFeedbackToken/);
  assert.match(worker, /export async function verifyFeedbackToken/);
  assert.match(worker, /kind: "feedback"/);
  assert.match(worker, /feedbackAuthorized/);
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


test("owner pairing code can authorize multiple devices until expiry", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const worker = fs.readFileSync("infra/telegram-webhook/worker.mjs", "utf8");
  const listener = fs.readFileSync("listener/bot.mjs", "utf8");

  const pairFunction = worker.match(/async function pairOwnerDevice[\s\S]*?\n}\n/);
  assert.ok(pairFunction);
  assert.doesNotMatch(pairFunction[0], /dispatchWorkflow\(env, "listener\.yml"/);
  assert.doesNotMatch(pairFunction[0], /action: "consume-pair-code"/);
  assert.match(pairFunction[0], /return issueOwnerToken\(env\)/);

  assert.match(html, /multiple devices during its 10-minute window/);
  assert.match(listener, /same code in BallerWatch Settings on multiple devices before it expires/);
  assert.match(
    listener,
    /event\?\.action === "consume-pair-code"[\s\S]*Pairing codes are intentionally reusable until expiry[\s\S]*return settings;/,
  );
  assert.doesNotMatch(
    listener.match(/if \(event\?\.action === "consume-pair-code"\)[\s\S]*?\n  }/)?.[0] || "",
    /webPairCodeHash:\s*""/,
  );
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


test("autocomplete floats above the Ask card without resizing the input row", () => {
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(css, /\/\* v5\.6 autocomplete overlay \*\//);
  assert.match(css, /\.ask-card \{[\s\S]*overflow:\s*visible;/);
  assert.match(css, /\.question-input-wrap \{[\s\S]*position:\s*relative;/);
  assert.match(
    css,
    /\/\* v5\.6 autocomplete overlay \*\/[\s\S]*\.question-suggestions \{[\s\S]*position:\s*absolute;[\s\S]*top:\s*calc\(100% \+ 0\.45rem\);[\s\S]*z-index:\s*80;/,
  );
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
  assert.match(css, /\.notification-reader \{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /\.notification-reader-content \{[\s\S]*max-width:\s*100%;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.notification-reader-content p \{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/);
});


test("match spotlight swipe uses connected neighboring cards like a carousel train", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /id="spotlight-carousel"/);
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
});


test("v5.5 dashboard matches the iPhone-first demo direction", () => {
  const html = fs.readFileSync("docs/index.html", "utf8");
  const app = fs.readFileSync("docs/app.js", "utf8");
  const css = fs.readFileSync("docs/styles.css", "utf8");

  assert.match(html, /Pickup \+ RATS monitor/);
  assert.match(html, /<h2>14-Day Calendar<\/h2>/);
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

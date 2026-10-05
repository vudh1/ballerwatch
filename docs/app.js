/**
 * Copyright © 2026 BallerWatch. All rights reserved.
 *
 * BallerWatch PWA client: renders the dashboard, read-only Q&A, notifications,
 * user Settings, connected-card navigation, and installed-app update behavior.
 *
 * v6.0 is web-only. Legacy `owner-*` DOM IDs and the existing localStorage
 * token key remain for installed-client compatibility, while authentication,
 * recovery, settings, Q&A, and notifications are all web-native.
 */
const API = "https://ballerwatch-web.vudhone.workers.dev";

const els = {
  system: document.querySelector("#system-status"),
  systemLine: document.querySelector(".system-line"),
  version: document.querySelector("#version"),
  board: document.querySelector("#board"),
  refresh: document.querySelector("#refresh-board"),
  notificationBell: document.querySelector("#notification-bell"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDialog: document.querySelector("#settings-dialog"),
  closeSettings: document.querySelector("#close-settings"),
  settingsLoginView: document.querySelector("#settings-login-view"),
  settingsOwnerView: document.querySelector("#settings-owner-view"),
  ownerLoginForm: document.querySelector("#owner-login-form"),
  ownerLoginUsername: document.querySelector("#owner-login-username"),
  ownerLoginPassword: document.querySelector("#owner-login-password"),
  ownerLoginStatus: document.querySelector("#owner-login-status"),
  ownerSettingsForm: document.querySelector("#owner-settings-form"),
  currentUserSummary: document.querySelector("#current-user-summary"),
  ownerName: document.querySelector("#owner-name"),
  ownerTeamSettings: document.querySelector("#owner-team-settings"),
  ownerTeams: document.querySelector("#owner-teams"),
  userManagement: document.querySelector("#user-management"),
  userList: document.querySelector("#user-list"),
  deletedMatchManagement: document.querySelector("#deleted-match-management"),
  deletedMatchList: document.querySelector("#deleted-match-list"),
  userCreateForm: document.querySelector("#user-create-form"),
  userCreateUsername: document.querySelector("#user-create-username"),
  userCreateName: document.querySelector("#user-create-name"),
  userCreatePassword: document.querySelector("#user-create-password"),
  userCreateStatus: document.querySelector("#user-create-status"),
  releaseManagement: document.querySelector("#release-management"),
  releaseVersionSummary: document.querySelector("#release-version-summary"),
  releaseTitleSummary: document.querySelector("#release-title-summary"),
  promoteRelease: document.querySelector("#promote-release"),
  promoteReleaseStatus: document.querySelector("#promote-release-status"),
  ownerSettingsStatus: document.querySelector("#owner-settings-status"),
  ownerPasswordForm: document.querySelector("#owner-password-form"),
  ownerPasswordNew: document.querySelector("#owner-password-new"),
  ownerPasswordConfirm: document.querySelector("#owner-password-confirm"),
  ownerPasswordStatus: document.querySelector("#owner-password-status"),
  ownerDisconnect: document.querySelector("#owner-disconnect"),
  ownerRevoke: document.querySelector("#owner-revoke"),
  notificationBadge: document.querySelector("#notification-badge"),
  notificationDialog: document.querySelector("#notification-dialog"),
  closeNotifications: document.querySelector("#close-notifications"),
  notificationReader: document.querySelector("#notification-reader"),
  closeNotificationReader: document.querySelector("#close-notification-reader"),
  notificationReaderTitle: document.querySelector("#notification-reader-title"),
  notificationReaderBody: document.querySelector("#notification-reader-body"),
  notificationReaderTime: document.querySelector("#notification-reader-time"),
  bellPushToggle: document.querySelector("#bell-push-toggle"),
  bellPushStatus: document.querySelector("#bell-push-status"),
  form: document.querySelector("#question-form"),
  question: document.querySelector("#question"),
  answer: document.querySelector("#answer"),
  answerFeedbackStatus: document.querySelector("#answer-feedback-status"),
  questionSuggestions: document.querySelector("#question-suggestions"),
  installCard: document.querySelector("#install-card"),
  installHelp: document.querySelector("#install-help"),
  installDialog: document.querySelector("#install-dialog"),
  spotlightCarousel: document.querySelector("#spotlight-carousel"),
  spotlightPrevious: document.querySelector("#spotlight-previous"),
  spotlightNext: document.querySelector("#spotlight-next"),
  nextGameCard: document.querySelector("#next-game-card"),
  spotlightLabel: document.querySelector("#spotlight-label"),
  nextGameTitle: document.querySelector("#next-game-title"),
  nextGameType: document.querySelector("#next-game-type"),
  nextGameMenuTrigger: document.querySelector("#next-game-menu-trigger"),
  nextGameMenu: document.querySelector("#next-game-menu"),
  nextGameMenuEdit: document.querySelector("#next-game-menu-edit"),
  nextGameMenuDelete: document.querySelector("#next-game-menu-delete"),
  nextGameMeta: document.querySelector("#next-game-meta"),
  nextGameLocation: document.querySelector("#next-game-location"),
  nextGameCapacity: document.querySelector("#next-game-capacity"),
  nextGameCapacityLabel: document.querySelector("#next-game-capacity-label"),
  nextGameCapacitySpots: document.querySelector("#next-game-capacity-spots"),
  nextGameCapacityFill: document.querySelector("#next-game-capacity-fill"),
  nextGameWeather: document.querySelector("#next-game-weather"),
  nextGameActions: document.querySelector("#next-game-actions"),
  nextGameRsvp: document.querySelector("#next-game-rsvp"),
  nextGameDirections: document.querySelector("#next-game-directions"),
  nextGameShare: document.querySelector("#next-game-share"),
  nextGameHint: document.querySelector("#next-game-hint"),
  nextGameUpdated: document.querySelector("#next-game-updated"),
  nextGameEdit: document.querySelector("#next-game-edit"),
  testNotification: document.querySelector("#test-notification"),
  deleteAllNotifications: document.querySelector("#delete-all-notifications"),
  testNotificationStatus: document.querySelector("#test-notification-status"),
  calendarCard: document.querySelector("#two-week-calendar"),
  calendarTitle: document.querySelector("#calendar-title"),
  calendarGrid: document.querySelector("#calendar-grid"),
  calendarGamePicker: document.querySelector("#calendar-game-picker"),
  calendarUpdated: document.querySelector("#calendar-updated"),
  matchOverrideDialog: document.querySelector("#match-override-dialog"),
  closeMatchOverride: document.querySelector("#close-match-override"),
  matchOverrideTitle: document.querySelector("#match-override-title"),
  matchOverrideCopy: document.querySelector("#match-override-copy"),
  matchOverrideForm: document.querySelector("#match-override-form"),
  matchOverrideDate: document.querySelector("#match-override-date"),
  matchOverrideStart: document.querySelector("#match-override-start"),
  matchOverrideEnd: document.querySelector("#match-override-end"),
  matchOverrideLocation: document.querySelector("#match-override-location"),
  matchOverrideReset: document.querySelector("#match-override-reset"),
  matchOverrideCancel: document.querySelector("#match-override-cancel"),
  matchOverrideStatus: document.querySelector("#match-override-status"),
};

let config = null;
let currentNextGame = null;
let currentCalendar = null;
let currentBoardEntries = [];
let selectedCalendarDate = "";
let selectedCalendarGameId = "";
let calendarWindowStart = "";
let calendarExpanded = false;
let confirmedRsvpDates = new Set();
let waitlistedRsvpDates = new Set();
let serviceWorkerRegistration = null;
let liveRefreshInFlight = false;
let initialLoadComplete = false;
let appRefreshDeferred = false;
let activeSuggestionIndex = -1;
let lastAnswerExchange = null;
let feedbackSubmitted = false;
let feedbackId = "";
let feedbackInFlight = false;
let currentUserSettings = null;
let currentReleaseStatus = null;
let pendingMatchAdminAction = "";
let matchOverrideSourceState = null;

const OWNER_TOKEN_KEY = "ballerwatch-owner-token";
const OWNER_USERNAME_KEY = "ballerwatch-user-name";
const NOTIFICATION_READ_KEY = "ballerwatch-notification-read-v1";
const NOTIFICATION_DELETED_KEY = "ballerwatch-notification-deleted-v1";
const QUESTION_HISTORY_KEY = "ballerwatch-question-history-v1";
const LIVE_DATA_REFRESH_MS = 60_000;
const APP_UPDATE_CHECK_MS = 5 * 60_000;

const COMMAND_SUGGESTIONS = [
  { value: "/today", label: "/today", description: "Today's games" },
  { value: "/next", label: "/next", description: "Next upcoming game" },
  { value: "/teams", label: "/teams", description: "Monitored league teams" },
  { value: "/count Thursday", label: "/count [day]", description: "Pickup RSVP count" },
  { value: "/field Thursday", label: "/field [day]", description: "Pickup field" },
  { value: "/time Thursday", label: "/time [day]", description: "Pickup time" },
  { value: "/version", label: "/version", description: "BallerWatch version" },
  { value: "/help", label: "/help", description: "Available questions and commands" },
];

const WEEKDAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const BASE_QUESTION_COMPLETIONS = [
  "What's my next game?",
  "Who do we play next?",
  "Where is my next game?",
  "What time is my next game?",
  "What games are this week?",
  "What games are next week?",
  "What league teams are you monitoring?",
  "What version is BallerWatch?",
  ...WEEKDAYS.flatMap((day) => [
    `What game is on ${day}?`,
    `Who do we play ${day}?`,
    `What jersey color do I wear ${day}?`,
    `What's the pickup count for ${day}?`,
    `How many spots are left for ${day}?`,
    `Am I in for ${day} pickup?`,
    `What field is ${day}?`,
    `Where is the game ${day}?`,
    `What time is the game ${day}?`,
  ]),
];

function normalizedWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function editDistanceAtMostOne(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function completionWordMatches(candidate, query) {
  if (candidate === query || candidate.startsWith(query) || query.startsWith(candidate)) return true;
  return candidate.length >= 4 && query.length >= 4 && editDistanceAtMostOne(candidate, query);
}

function sentenceCompletionScore(candidate, query) {
  const cleanCandidate = String(candidate || "").toLowerCase();
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return 99;
  if (cleanCandidate.startsWith(cleanQuery)) return 0;

  const queryWords = normalizedWords(cleanQuery);
  const candidateWords = normalizedWords(cleanCandidate);
  let fuzzy = 0;
  for (const queryWord of queryWords) {
    const exact = candidateWords.some((word) =>
      word === queryWord || word.startsWith(queryWord) || queryWord.startsWith(word));
    if (exact) continue;
    const near = candidateWords.some((word) => completionWordMatches(word, queryWord));
    if (!near) return 99;
    fuzzy += 1;
  }
  return fuzzy ? 2 : 1;
}

function questionHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((value) => typeof value === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

function rememberQuestion(value) {
  const question = String(value || "").trim();
  if (!question || question.startsWith("/")) return;
  const next = [question, ...questionHistory().filter((item) => item.toLowerCase() !== question.toLowerCase())]
    .slice(0, 12);
  localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(next));
}

function shortQuestionDate(date) {
  const match = String(date || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : "";
}

function calendarQuestionCompletions() {
  const games = Array.isArray(currentCalendar?.games) ? currentCalendar.games : [];
  const byDate = new Map();
  for (const game of games) {
    if (!game?.date || byDate.has(game.date)) continue;
    byDate.set(game.date, game);
  }

  const values = [];
  for (const [date, game] of [...byDate.entries()].slice(0, 10)) {
    const label = shortQuestionDate(date);
    if (!label) continue;
    values.push(
      `What game is on ${label}?`,
      `What time is the game on ${label}?`,
      `Where is the game on ${label}?`,
    );
    if (game.kind === "league") {
      values.push(
        `Who do we play on ${label}?`,
        `What jersey color do I wear for ${label}?`,
      );
    } else if (game.kind === "pickup") {
      values.push(
        `How many spots are left for ${label}?`,
        `Am I in for pickup on ${label}?`,
      );
    }
  }
  return values;
}

function allQuestionCompletions() {
  return [...new Set([
    ...questionHistory(),
    ...calendarQuestionCompletions(),
    ...BASE_QUESTION_COMPLETIONS,
  ])];
}

function suggestionMatches(value) {
  const raw = String(value || "");
  const lower = raw.trim().toLowerCase();

  if (raw.startsWith("/")) {
    return COMMAND_SUGGESTIONS.filter((item) =>
      item.label.toLowerCase().startsWith(lower) ||
      item.value.toLowerCase().startsWith(lower),
    );
  }

  if (lower.length < 1) return [];
  const recent = new Set(questionHistory().map((item) => item.toLowerCase()));
  return allQuestionCompletions()
    .map((value) => ({
      value,
      label: value,
      description: recent.has(value.toLowerCase()) ? "Recent" : "",
      score: sentenceCompletionScore(value, lower),
      recent: recent.has(value.toLowerCase()),
    }))
    .filter((item) => item.score < 99)
    .sort((a, b) =>
      a.score - b.score ||
      Number(b.recent) - Number(a.recent) ||
      a.value.length - b.value.length)
    .slice(0, 8);
}

function hideQuestionSuggestions() {
  els.questionSuggestions.hidden = true;
  els.question.setAttribute("aria-expanded", "false");
  activeSuggestionIndex = -1;
}

function selectQuestionSuggestion(index) {
  const options = [...els.questionSuggestions.querySelectorAll("[role=option]")];
  const option = options[index];
  if (!option) return;
  els.question.value = option.dataset.value || option.textContent || "";
  hideQuestionSuggestions();
  els.question.focus();
}

function renderQuestionSuggestions() {
  const suggestions = suggestionMatches(els.question.value);
  els.questionSuggestions.replaceChildren();
  activeSuggestionIndex = -1;

  if (!suggestions.length) {
    hideQuestionSuggestions();
    return;
  }

  suggestions.forEach((suggestion, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "question-suggestion";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.dataset.value = suggestion.value;
    button.dataset.index = String(index);

    const label = document.createElement("strong");
    label.textContent = suggestion.label;

    button.append(label);
    if (suggestion.description) {
      const description = document.createElement("span");
      description.textContent = suggestion.description;
      button.append(description);
    }
    button.addEventListener("click", () => selectQuestionSuggestion(index));
    els.questionSuggestions.append(button);
  });

  els.questionSuggestions.hidden = false;
  els.question.setAttribute("aria-expanded", "true");
}

function moveSuggestionSelection(delta) {
  const options = [...els.questionSuggestions.querySelectorAll("[role=option]")];
  if (!options.length) return;
  activeSuggestionIndex =
    (activeSuggestionIndex + delta + options.length) % options.length;
  options.forEach((option, index) => {
    const selected = index === activeSuggestionIndex;
    option.setAttribute("aria-selected", String(selected));
    if (selected) option.scrollIntoView({ block: "nearest" });
  });
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function ios() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function applyInstallState() {
  if (standalone()) {
    els.installCard?.remove();
  }
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function arrayBufferToBase64Url(value) {
  const bytes = new Uint8Array(value || new ArrayBuffer(0));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function subscriptionMatchesConfig(subscription) {
  const expected = config?.push?.applicationServerKey || "";
  const actual = subscription?.options?.applicationServerKey
    ? arrayBufferToBase64Url(subscription.options.applicationServerKey)
    : "";
  return Boolean(expected && actual && expected === actual);
}

function ownerToken() {
  return localStorage.getItem(OWNER_TOKEN_KEY) || "";
}

function ownerHeaders() {
  const token = ownerToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function loadRsvpStatus() {
  if (!ownerToken()) {
    confirmedRsvpDates = new Set();
    waitlistedRsvpDates = new Set();
    return false;
  }

  try {
    const payload = await api("/web/user/rsvp-status", {
      headers: ownerHeaders(),
      retryNetwork: true,
    });
    confirmedRsvpDates = new Set(
      Array.isArray(payload?.rsvp?.confirmedDates) ? payload.rsvp.confirmedDates : [],
    );
    waitlistedRsvpDates = new Set(
      Array.isArray(payload?.rsvp?.waitlistedDates) ? payload.rsvp.waitlistedDates : [],
    );
    return true;
  } catch (error) {
    confirmedRsvpDates = new Set();
    waitlistedRsvpDates = new Set();
    if (error.status === 401) localStorage.removeItem(OWNER_TOKEN_KEY);
    return false;
  }
}

async function api(path, options = {}) {
  const { retryNetwork = false, ...requestOptions } = options;
  const attempts = retryNetwork ? 2 : 1;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(API + path, {
        cache: "no-store",
        ...requestOptions,
        headers: {
          "content-type": "application/json",
          ...(requestOptions.headers || {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      const networkFailure = error instanceof TypeError || /load failed|failed to fetch/i.test(String(error?.message || ""));
      if (!retryNetwork || !networkFailure || attempt === attempts - 1) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  throw lastError || new Error("Request failed.");
}

function showLoginSettings(message = "") {
  currentUserSettings = null;
  els.settingsLoginView.hidden = false;
  els.settingsOwnerView.hidden = true;
  if (els.ownerLoginUsername) {
    els.ownerLoginUsername.value = localStorage.getItem(OWNER_USERNAME_KEY) || "admin";
  }
  els.ownerLoginStatus.textContent = message;
}

function renderManagedUsers(users) {
  els.userList.replaceChildren();
  for (const user of Array.isArray(users) ? users : []) {
    const row = document.createElement("div");
    row.className = "settings-user-row";

    const copy = document.createElement("div");
    copy.className = "settings-user-meta";
    const title = document.createElement("strong");
    title.textContent = `@${user.username}`;
    const detail = document.createElement("span");
    const parts = [user.role === "admin" ? "Administrator" : "User"];
    if (user.rsvpName) parts.push(`RSVP: ${user.rsvpName}`);
    detail.textContent = parts.join(" · ");
    copy.append(title, detail);
    row.append(copy);

    if (user.username !== "admin") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "subtle-action subtle-danger user-remove";
      remove.dataset.username = user.username;
      remove.textContent = "Remove";
      row.append(remove);
    }
    els.userList.append(row);
  }
}

function renderDeletedMatches(matches) {
  els.deletedMatchList.replaceChildren();
  for (const match of Array.isArray(matches) ? matches : []) {
    const row = document.createElement("div");
    row.className = "deleted-match-row";

    const copy = document.createElement("div");
    copy.className = "deleted-match-meta";
    const title = document.createElement("strong");
    title.textContent = match.label || match.id || "Deleted match";
    const detail = document.createElement("span");
    detail.textContent = [match.date || "", match.id || ""].filter(Boolean).join(" · ");
    copy.append(title, detail);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "subtle-action";
    restore.dataset.restoreMatchId = match.id || "";
    restore.textContent = "Restore";

    row.append(copy, restore);
    els.deletedMatchList.append(row);
  }
}

function showOwnerSettings(settings) {
  currentUserSettings = settings || null;
  els.settingsLoginView.hidden = true;
  els.settingsOwnerView.hidden = false;
  const username = settings?.username || localStorage.getItem(OWNER_USERNAME_KEY) || "admin";
  localStorage.setItem(OWNER_USERNAME_KEY, username);
  els.currentUserSummary.textContent =
    `Signed in as @${username} · ${settings?.role === "admin" ? "Administrator" : "User"}`;
  els.ownerName.value = settings?.ownerName || "";
  els.ownerTeams.value = Array.isArray(settings?.teams) ? settings.teams.join("\n") : "";
  els.ownerTeamSettings.hidden = !settings?.canManageTeams;
  els.userManagement.hidden = !settings?.canManageUsers;
  const deletedMatches = Array.isArray(settings?.deletedMatches) ? settings.deletedMatches : [];
  els.deletedMatchManagement.hidden = !settings?.canManageMatches || deletedMatches.length === 0;
  els.releaseManagement.hidden = !settings?.canManageMatches;
  if (settings?.canManageUsers) renderManagedUsers(settings?.users);
  if (settings?.canManageMatches) renderDeletedMatches(deletedMatches);
  if (!settings?.canManageMatches) {
    currentReleaseStatus = null;
    els.promoteRelease.disabled = true;
  }
  els.ownerPasswordStatus.textContent = settings?.passwordConfigured
    ? "Your password is set. Changing it revokes your other sessions."
    : "No password is configured for this account.";
}

async function loadOwnerSettings() {
  if (!ownerToken()) {
    showLoginSettings();
    return;
  }

  els.ownerSettingsStatus.textContent = "Loading…";
  try {
    const payload = await api("/web/user/settings", {
      headers: ownerHeaders(),
      retryNetwork: true,
    });
    showOwnerSettings(payload.settings || {});
    els.ownerSettingsStatus.textContent = "";
    if (payload.settings?.canManageMatches) {
      await loadReleaseStatus();
    }
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("Sign in again to edit user settings.");
      return;
    }
    els.ownerSettingsStatus.textContent = error.message;
  }
}

function renderReleaseStatus(release) {
  currentReleaseStatus = release || null;
  if (!release) {
    els.releaseVersionSummary.textContent = "Version status unavailable";
    els.releaseTitleSummary.textContent = "";
    els.promoteRelease.textContent = "Check again";
    els.promoteRelease.disabled = false;
    return;
  }

  const source = release.sourceVersion || "unknown";
  const production = release.productionVersion || "unknown";
  if (release.updateAvailable) {
    els.releaseVersionSummary.textContent = `Production ${production} → Available ${source}`;
    els.releaseTitleSummary.textContent = release.title || "";
    els.promoteRelease.textContent = `Update app to ${source}`;
    els.promoteRelease.disabled = false;
  } else {
    els.releaseVersionSummary.textContent = `Production ${production} · Up to date`;
    els.releaseTitleSummary.textContent = release.title || "";
    els.promoteRelease.textContent = "App is up to date";
    els.promoteRelease.disabled = true;
  }
}

async function loadReleaseStatus() {
  if (!ownerToken() || els.releaseManagement.hidden) return;
  els.promoteRelease.disabled = true;
  els.promoteRelease.textContent = "Checking…";
  els.promoteReleaseStatus.textContent = "Checking main against production…";
  try {
    const payload = await api("/web/user/release-status", {
      headers: ownerHeaders(),
      retryNetwork: true,
    });
    renderReleaseStatus(payload.release || null);
    els.promoteReleaseStatus.textContent = payload.release?.updateAvailable
      ? "Ready to run the existing validated production-promotion workflow."
      : "Production already matches the current source version.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("Sign in again to manage app updates.");
      return;
    }
    renderReleaseStatus(null);
    els.promoteReleaseStatus.textContent = error.message;
  }
}

async function promoteProductionRelease() {
  if (!currentReleaseStatus?.updateAvailable) {
    await loadReleaseStatus();
    if (!currentReleaseStatus?.updateAvailable) return;
  }

  const version = currentReleaseStatus.sourceVersion || "the latest version";
  if (!window.confirm(`Promote BallerWatch ${version} to production?\n\nThe normal validation and release gates will still apply.`)) {
    return;
  }

  els.promoteRelease.disabled = true;
  els.promoteRelease.textContent = "Starting…";
  els.promoteReleaseStatus.textContent = "Requesting production promotion…";
  try {
    const payload = await api("/web/user/promote-release", {
      method: "POST",
      headers: ownerHeaders(),
      body: "{}",
    });
    renderReleaseStatus(payload.release || currentReleaseStatus);
    if (payload.dispatched) {
      els.promoteRelease.disabled = true;
      els.promoteRelease.textContent = "Promotion requested";
    }
    els.promoteReleaseStatus.textContent =
      payload.message || "Promotion request accepted.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("Sign in again to promote an app update.");
      return;
    }
    els.promoteRelease.disabled = false;
    els.promoteRelease.textContent = `Update app to ${version}`;
    els.promoteReleaseStatus.textContent = error.message;
  }
}

async function openSettings(options = {}) {
  const pendingAction =
    options && typeof options === "object" && "pendingAction" in options
      ? String(options.pendingAction || "")
      : "";
  pendingMatchAdminAction = pendingAction;
  if (!els.settingsDialog.open) els.settingsDialog.showModal();
  await loadOwnerSettings();
}

async function loginOwnerDevice(event) {
  event.preventDefault();
  const username = els.ownerLoginUsername.value.trim().toLowerCase();
  const password = els.ownerLoginPassword.value;
  const button = els.ownerLoginForm.querySelector("button");
  button.disabled = true;
  els.ownerLoginStatus.textContent = "Signing in…";
  try {
    const payload = await api("/web/user/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(OWNER_TOKEN_KEY, payload.token);
    localStorage.setItem(OWNER_USERNAME_KEY, payload.username || username || "admin");
    els.ownerLoginPassword.value = "";
    const resumeMatchAction = pendingMatchAdminAction;
    await loadOwnerSettings();
    await loadRsvpStatus();
    if (currentNextGame) {
      renderNextGame(currentNextGame, els.spotlightLabel.textContent || "NEXT GAME");
    }

    if (resumeMatchAction) {
      pendingMatchAdminAction = "";
      if (currentUserSettings?.canManageMatches) {
        if (els.settingsDialog.open) els.settingsDialog.close();
        if (resumeMatchAction === "match-delete") {
          await deleteSelectedMatch({ authorized: true });
        } else {
          await openMatchOverrideEditor({ authorized: true });
        }
      } else {
        els.ownerSettingsStatus.textContent =
          "Administrator access is required to edit or delete match details.";
      }
    }
  } catch (error) {
    els.ownerLoginStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveOwnerSettings(event) {
  event.preventDefault();
  const button = els.ownerSettingsForm.querySelector("button");
  const body = { ownerName: els.ownerName.value.trim() };
  if (!els.ownerTeamSettings.hidden) {
    body.teams = els.ownerTeams.value
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  button.disabled = true;
  els.ownerSettingsStatus.textContent = "Saving…";
  try {
    const payload = await api("/web/user/settings", {
      method: "POST",
      headers: ownerHeaders(),
      retryNetwork: true,
      body: JSON.stringify(body),
    });
    showOwnerSettings(payload.settings || {});
    await loadRsvpStatus();
    if (currentNextGame) {
      renderNextGame(currentNextGame, els.spotlightLabel.textContent || "NEXT GAME");
    }
    els.ownerSettingsStatus.textContent = els.ownerTeamSettings.hidden
      ? "Profile saved."
      : "Saved. Monitoring updates on the next league refresh.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("Sign in again to edit user settings.");
    } else {
      els.ownerSettingsStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
  }
}

async function createManagedUser(event) {
  event.preventDefault();
  const button = els.userCreateForm.querySelector("button");
  button.disabled = true;
  els.userCreateStatus.textContent = "Adding user…";
  try {
    const payload = await api("/web/user/users", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify({
        username: els.userCreateUsername.value.trim().toLowerCase(),
        ownerName: els.userCreateName.value.trim(),
        password: els.userCreatePassword.value,
      }),
    });
    els.userCreateForm.reset();
    showOwnerSettings(payload.settings || {});
    els.userCreateStatus.textContent = "User added.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("Sign in again to manage users.");
    } else {
      els.userCreateStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
  }
}

async function removeManagedUser(username) {
  if (!username || !window.confirm(`Remove @${username}? Their active sessions will stop working.`)) return;
  els.userCreateStatus.textContent = `Removing @${username}…`;
  try {
    const payload = await api("/web/user/users", {
      method: "DELETE",
      headers: ownerHeaders(),
      body: JSON.stringify({ username }),
    });
    showOwnerSettings(payload.settings || {});
    els.userCreateStatus.textContent = `Removed @${username}.`;
  } catch (error) {
    els.userCreateStatus.textContent = error.message;
  }
}

async function saveOwnerPassword(event) {
  event.preventDefault();
  const password = els.ownerPasswordNew.value;
  const confirm = els.ownerPasswordConfirm.value;
  const button = els.ownerPasswordForm.querySelector("button");

  if (password !== confirm) {
    els.ownerPasswordStatus.textContent = "Passwords do not match.";
    return;
  }

  button.disabled = true;
  els.ownerPasswordStatus.textContent = "Saving password…";
  try {
    const payload = await api("/web/user/password", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify({ password }),
    });
    if (payload.token) localStorage.setItem(OWNER_TOKEN_KEY, payload.token);
    if (payload.username) localStorage.setItem(OWNER_USERNAME_KEY, payload.username);
    els.ownerPasswordNew.value = "";
    els.ownerPasswordConfirm.value = "";
    els.ownerPasswordStatus.textContent = payload.message ||
      "Password saved. Your other sessions were revoked.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("Sign in again to change your password.");
    } else {
      els.ownerPasswordStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
  }
}

function disconnectOwnerDevice() {
  localStorage.removeItem(OWNER_TOKEN_KEY);
  confirmedRsvpDates = new Set();
  waitlistedRsvpDates = new Set();
  if (currentNextGame) {
    renderNextGame(currentNextGame, els.spotlightLabel.textContent || "NEXT GAME");
  }
  showLoginSettings("This device is signed out of private settings.");
}

async function revokeOwnerDevices() {
  els.ownerRevoke.disabled = true;
  els.ownerSettingsStatus.textContent = "Signing out your other devices…";
  try {
    await api("/web/user/revoke", {
      method: "POST",
      headers: ownerHeaders(),
      body: "{}",
    });
    localStorage.removeItem(OWNER_TOKEN_KEY);
    confirmedRsvpDates = new Set();
    waitlistedRsvpDates = new Set();
    if (currentNextGame) {
      renderNextGame(currentNextGame, els.spotlightLabel.textContent || "NEXT GAME");
    }
    showLoginSettings("All sessions for this user were revoked. Sign in again when needed.");
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showLoginSettings("This sign-in has expired. Sign in again.");
    } else {
      els.ownerSettingsStatus.textContent = error.message;
    }
  } finally {
    els.ownerRevoke.disabled = false;
  }
}

function setSystemState(state) {
  const live = state === "live";
  const checking = state === "checking";
  els.system.textContent = live ? "Live" : checking ? "Checking…" : "Offline";
  els.system.style.color = live ? "#86efac" : checking ? "" : "#fde68a";
  els.systemLine?.classList.toggle("is-live", live);
  els.systemLine?.classList.toggle("is-offline", !live && !checking);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    if (!initialLoadComplete) {
      appRefreshDeferred = true;
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register("./sw.js?v=6.4.0", {
    scope: "./",
    updateViaCache: "none",
  });
  serviceWorkerRegistration = registration;
  await registration.update().catch(() => null);
  return registration;
}

async function loadConfig() {
  try {
    config = await api("/web/config");
    els.version.textContent = `BallerWatch v${config.version}`;
    return true;
  } catch {
    setSystemState("offline");
    return false;
  }
}

function updateNotificationBadge(count) {
  if (!count) {
    els.notificationBadge.hidden = true;
    return;
  }
  els.notificationBadge.textContent = count > 9 ? "9+" : String(count);
  els.notificationBadge.hidden = false;
}

function storedNotificationIds(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveNotificationIds(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify([...values].slice(-160)));
  } catch {}
}

function notificationId(item) {
  return String(
    item?.id ||
    [item?.createdAt || "", item?.title || "", item?.body || ""].join("|"),
  );
}

function notificationTimeText(item) {
  const date = new Date(item?.createdAt || "");
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function notificationViewState(entries = currentBoardEntries) {
  const read = storedNotificationIds(NOTIFICATION_READ_KEY);
  const deleted = storedNotificationIds(NOTIFICATION_DELETED_KEY);
  const visible = entries.filter((item) => !deleted.has(notificationId(item)));
  const unreadCount = visible.filter((item) => !read.has(notificationId(item))).length;
  return { read, deleted, visible, unreadCount };
}

function markNotificationRead(item) {
  const id = notificationId(item);
  const read = storedNotificationIds(NOTIFICATION_READ_KEY);
  read.add(id);
  saveNotificationIds(NOTIFICATION_READ_KEY, read);
  updateNotificationBadge(notificationViewState().unreadCount);
}

function persistDeletedNotifications(items) {
  const deleted = storedNotificationIds(NOTIFICATION_DELETED_KEY);
  for (const item of items) deleted.add(notificationId(item));
  saveNotificationIds(NOTIFICATION_DELETED_KEY, deleted);
}

function deleteNotification(item) {
  persistDeletedNotifications([item]);
  renderBoard(currentBoardEntries);
}

function animateNotificationDelete(article, item) {
  if (article.classList.contains("is-deleting")) return;
  article.style.removeProperty("transform");
  article.style.removeProperty("opacity");
  void article.offsetWidth;
  article.classList.add("is-deleting");
  window.setTimeout(() => deleteNotification(item), 210);
}

function deleteAllNotifications() {
  const { visible } = notificationViewState();
  if (!visible.length) return;

  els.deleteAllNotifications.disabled = true;
  const notices = [...els.board.querySelectorAll(".notice")];
  notices.forEach((article, index) => {
    window.setTimeout(() => article.classList.add("is-deleting"), Math.min(index, 8) * 22);
  });

  const delay = 210 + Math.min(notices.length, 8) * 22;
  window.setTimeout(() => {
    persistDeletedNotifications(visible);
    renderBoard(currentBoardEntries);
    els.deleteAllNotifications.disabled = false;
    els.testNotificationStatus.textContent = "Notifications cleared on this device.";
  }, delay);
}

function openNotification(item) {
  markNotificationRead(item);
  els.notificationReaderTitle.textContent = item.title || "BallerWatch update";
  els.notificationReaderBody.textContent = item.body || "";
  els.notificationReaderTime.textContent = notificationTimeText(item);
  if (els.notificationDialog.open) els.notificationDialog.close();
  els.notificationReader.showModal();
}

function closeNotificationReader() {
  els.notificationReader.close();
  renderBoard(currentBoardEntries);
  els.notificationDialog.showModal();
}

function renderBoard(entries) {
  currentBoardEntries = Array.isArray(entries) ? entries : [];
  const { read, visible, unreadCount } = notificationViewState(currentBoardEntries);
  els.board.replaceChildren();
  updateNotificationBadge(unreadCount);

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = currentBoardEntries.length
      ? "No notifications left on this device."
      : "No web notifications yet.";
    els.board.append(empty);
    return;
  }

  for (const item of visible) {
    const id = notificationId(item);
    const article = document.createElement("article");
    article.className = "notice";
    article.classList.toggle("is-unread", !read.has(id));
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `Read ${item.title || "BallerWatch notification"}`);

    const title = document.createElement("h3");
    title.textContent = item.title || "BallerWatch update";

    const body = document.createElement("p");
    body.className = "notice-preview";
    body.textContent = item.body || "";

    const time = document.createElement("time");
    time.textContent = notificationTimeText(item);

    let touchStartX = null;
    let touchStartY = null;
    let deletedBySwipe = false;

    article.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      deletedBySwipe = false;
      article.classList.add("is-swiping");
    }, { passive: true });

    article.addEventListener("touchmove", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch || touchStartX == null || touchStartY == null) return;
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      if (deltaX >= 0 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      event.preventDefault();
      const offset = Math.max(-110, deltaX);
      const progress = Math.min(1, Math.abs(offset) / 110);
      article.style.transform = `translateX(${offset}px)`;
      article.style.opacity = String(1 - progress * 0.42);
    }, { passive: false });

    article.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch || touchStartX == null || touchStartY == null) return;
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      article.classList.remove("is-swiping");

      if (deltaX < -64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        event.preventDefault();
        deletedBySwipe = true;
        animateNotificationDelete(article, item);
      } else {
        article.style.removeProperty("transform");
        article.style.removeProperty("opacity");
      }

      touchStartX = null;
      touchStartY = null;
    }, { passive: false });

    article.addEventListener("click", () => {
      if (!deletedBySwipe) openNotification(item);
    });
    article.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openNotification(item);
    });

    article.append(title, body, time);
    els.board.append(article);
  }
}

function googleMapsUrl(query) {
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function weatherGlyph(code) {
  const value = Number(code);
  if (value === 0) return "☀️";
  if ([1, 2].includes(value)) return "🌤️";
  if (value === 3) return "☁️";
  if ([45, 48].includes(value)) return "🌫️";
  if (value >= 51 && value <= 67) return "🌧️";
  if (value >= 71 && value <= 77) return "🌨️";
  if (value >= 80 && value <= 86) return "🌦️";
  if (value >= 95) return "⛈️";
  return "🌡️";
}

function weatherSummary(weather, stale = false, approximate = false) {
  if (!weather) return "";
  const parts = [
    weatherGlyph(weather.weatherCode),
    weather.condition || "",
    Number.isFinite(Number(weather.temperatureF)) ? `${Math.round(Number(weather.temperatureF))}°F` : "",
    Number.isFinite(Number(weather.rainProbability))
      ? `${Math.round(Number(weather.rainProbability))}% rain`
      : "",
    approximate ? "Seattle-area" : "",
    stale ? "cached" : "",
  ].filter(Boolean);
  return parts.join("  ");
}

function matchUpdatedText(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function spotlightModel(game, label = "NEXT GAME") {
  if (!game) {
    return {
      label,
      title: "No upcoming game",
      type: "None",
      meta: "No pickup or RATS game is currently published.",
      location: "",
      capacityText: "",
      capacityPercent: 0,
      spotsText: "",
      weather: "",
      updated: "",
      rsvp: "",
      rsvpConfirmed: false,
      rsvpWaitlisted: false,
      directions: "",
      actionsHidden: true,
      editHidden: true,
    };
  }

  const capacityText = game.kind === "pickup" && game.reserved != null
    ? (
        game.capacity == null
          ? `${game.reserved} reserved`
          : `${game.reserved} / ${game.capacity} reserved`
      )
    : "";

  const locationParts = [];
  if (game.location) locationParts.push(game.location);
  if (game.address && game.address !== game.location) locationParts.push(game.address);
  if (game.jerseyColor) locationParts.push(`${game.jerseyColor} jersey`);

  const capacity = Number(game.capacity);
  const reserved = Number(game.reserved);
  const hasCapacity = game.kind === "pickup" && Number.isFinite(reserved);
  const capacityPercent = hasCapacity && Number.isFinite(capacity) && capacity > 0
    ? Math.max(0, Math.min(100, Math.round((reserved / capacity) * 100)))
    : 0;
  const spotsText = hasCapacity && Number.isFinite(capacity)
    ? (capacity - reserved > 0 ? `${capacity - reserved} spots left` : "Full")
    : "";

  return {
    label,
    title: game.dateLabel || game.title || "Upcoming game",
    type: game.kind === "pickup"
      ? "Pickup"
      : game.kind === "free_pickup"
        ? "Free Pickup"
        : "League",
    meta: [game.time, game.title && game.title !== game.dateLabel ? game.title : ""]
      .filter(Boolean)
      .join(" • "),
    location: locationParts.join(" • "),
    capacityText,
    capacityPercent,
    spotsText,
    weather: weatherSummary(
      game.weather,
      game.weatherStale,
      game.weatherApproximate,
    ),
    updated: game.overrideActive
      ? ["Manual override", matchUpdatedText(game.overrideUpdatedAt || game.sourceUpdatedAt)]
          .filter(Boolean).join(" · ")
      : matchUpdatedText(game.sourceUpdatedAt),
    rsvp: game.kind === "pickup" ? String(game.rsvpUrl || "") : "",
    rsvpConfirmed: game.kind === "pickup" && confirmedRsvpDates.has(game.date),
    rsvpWaitlisted: game.kind === "pickup" && waitlistedRsvpDates.has(game.date),
    directions: googleMapsUrl(game.mapsQuery),
    actionsHidden: false,
    editHidden: false,
  };
}

function applySpotlightModel(targets, game, label = "NEXT GAME") {
  const model = spotlightModel(game, label);
  targets.label.textContent = model.label;
  targets.title.textContent = model.title;
  targets.type.textContent = model.type;
  targets.meta.textContent = model.meta;
  targets.location.textContent = model.location;
  targets.capacity.hidden = !model.capacityText;
  targets.capacityLabel.textContent = model.capacityText;
  targets.capacitySpots.textContent = model.spotsText;
  targets.capacityFill.style.width = `${model.capacityPercent}%`;
  targets.weather.textContent = model.weather;
  targets.weather.hidden = !model.weather;
  targets.updated.textContent = model.updated;
  targets.updated.hidden = !model.updated;
  targets.actions.hidden = model.actionsHidden;
  if (targets.edit) targets.edit.hidden = model.editHidden;
  if (targets.menuTrigger) targets.menuTrigger.hidden = model.editHidden;
  targets.hint.textContent = "";

  if (model.rsvp) {
    targets.rsvp.href = model.rsvp;
    targets.rsvp.hidden = false;
    targets.rsvp.classList.toggle("is-confirmed", model.rsvpConfirmed);
    targets.rsvp.classList.toggle("is-waitlisted", model.rsvpWaitlisted);
    targets.rsvp.textContent = model.rsvpConfirmed ? "RSVP'd" : "RSVP";
    targets.rsvp.setAttribute(
      "aria-label",
      model.rsvpConfirmed
        ? "RSVP confirmed — open pickup RSVP site"
        : "Open pickup RSVP site",
    );
  } else {
    targets.rsvp.removeAttribute("href");
    targets.rsvp.classList.remove("is-confirmed", "is-waitlisted");
    targets.rsvp.textContent = "RSVP";
    targets.rsvp.hidden = true;
  }

  if (model.directions) {
    targets.directions.href = model.directions;
    targets.directions.hidden = false;
  } else {
    targets.directions.removeAttribute("href");
    targets.directions.hidden = true;
  }
}

function currentSpotlightTargets() {
  return {
    label: els.spotlightLabel,
    title: els.nextGameTitle,
    type: els.nextGameType,
    menuTrigger: els.nextGameMenuTrigger,
    meta: els.nextGameMeta,
    location: els.nextGameLocation,
    capacity: els.nextGameCapacity,
    capacityLabel: els.nextGameCapacityLabel,
    capacitySpots: els.nextGameCapacitySpots,
    capacityFill: els.nextGameCapacityFill,
    weather: els.nextGameWeather,
    updated: els.nextGameUpdated,
    edit: els.nextGameEdit,
    actions: els.nextGameActions,
    rsvp: els.nextGameRsvp,
    directions: els.nextGameDirections,
    hint: els.nextGameHint,
  };
}

function renderNextGame(game, label = "NEXT GAME") {
  closeMatchCardMenu();
  currentNextGame = game
    ? {
        ...game,
        shareText: game.shareText || [
          game.title,
          game.dateLabel,
          game.time,
          game.location,
          game.kind === "pickup" && game.reserved != null
            ? (
                game.capacity == null
                  ? `${game.reserved} reserved`
                  : `${game.reserved} / ${game.capacity} reserved`
              )
            : "",
        ].filter(Boolean).join("\n"),
      }
    : null;

  applySpotlightModel(currentSpotlightTargets(), currentNextGame, label);
}

function buildSpotlightTrainCard(game) {
  const card = els.nextGameCard.cloneNode(true);
  card.removeAttribute("id");
  card.classList.remove("spotlight-selected");
  card.classList.add("spotlight-train-card");
  card.setAttribute("aria-hidden", "true");

  for (const node of card.querySelectorAll("[id]")) {
    node.dataset.spotlightRole = node.id;
    node.removeAttribute("id");
  }

  const role = (name) => card.querySelector(`[data-spotlight-role="${name}"]`);
  applySpotlightModel(
    {
      label: role("spotlight-label"),
      title: role("next-game-title"),
      type: role("next-game-type"),
      menuTrigger: role("next-game-menu-trigger"),
      meta: role("next-game-meta"),
      location: role("next-game-location"),
      capacity: role("next-game-capacity"),
      capacityLabel: role("next-game-capacity-label"),
      capacitySpots: role("next-game-capacity-spots"),
      capacityFill: role("next-game-capacity-fill"),
      weather: role("next-game-weather"),
      updated: role("next-game-updated"),
      edit: role("next-game-edit"),
      actions: role("next-game-actions"),
      rsvp: role("next-game-rsvp"),
      directions: role("next-game-directions"),
      hint: role("next-game-hint"),
    },
    game,
    "SELECTED GAME",
  );

  for (const control of card.querySelectorAll("a, button")) {
    control.tabIndex = -1;
  }

  return card;
}

function syncSpotlightCardDimensions() {
  const carousel = els.spotlightCarousel;
  const current = els.nextGameCard;
  if (!carousel || !current) return;

  carousel.style.removeProperty("--spotlight-card-height");

  const probes = [];
  for (const game of currentCalendar?.games || []) {
    const probe = buildSpotlightTrainCard(game);
    probe.classList.add("spotlight-measure-card");
    carousel.append(probe);
    probes.push(probe);
  }

  const heights = probes
    .map((probe) => probe.getBoundingClientRect().height)
    .filter((height) => Number.isFinite(height) && height > 0);

  for (const probe of probes) probe.remove();

  const fallbackHeight = current.getBoundingClientRect().height;
  const height = heights.length
    ? Math.ceil(Math.max(...heights))
    : Math.ceil(Number.isFinite(fallbackHeight) ? fallbackHeight : 0);
  if (height > 0) {
    carousel.style.setProperty("--spotlight-card-height", `${height}px`);
  }
}

function addIsoDays(date, days) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12))
    .toISOString()
    .slice(0, 10);
}

function dateDisplay(date, options = {}) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    ...options,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function gameWeatherRank(game) {
  return Number(game?.weather?.rainProbability ?? -1);
}

function renderCalendarGamePicker(games, selectedId = "") {
  els.calendarGamePicker.replaceChildren();

  if (!Array.isArray(games) || games.length <= 1) {
    els.calendarGamePicker.hidden = true;
    return;
  }

  els.calendarGamePicker.hidden = false;
  for (const game of games) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-game-choice";
    button.dataset.gameId = game.id || "";
    button.setAttribute("aria-pressed", String(game.id === selectedId));

    const title = document.createElement("strong");
    title.textContent = game.title || "Game";
    const time = document.createElement("span");
    time.textContent = game.time || "";
    button.append(title, time);

    button.addEventListener("click", () => {
      selectedCalendarGameId = game.id || "";
      for (const item of els.calendarGamePicker.querySelectorAll(".calendar-game-choice")) {
        item.setAttribute("aria-pressed", String(item === button));
      }
      renderNextGame(game, "SELECTED GAME");
      els.nextGameCard.classList.add("spotlight-selected");
    });
    els.calendarGamePicker.append(button);
  }
}

function isoDayDistance(startDate, endDate) {
  const parse = (value) => {
    const [year, month, day] = String(value).split("-").map(Number);
    return Date.UTC(year, month - 1, day, 12);
  };
  return Math.round((parse(endDate) - parse(startDate)) / 86_400_000);
}

function latestCalendarGameDate() {
  const dates = (currentCalendar?.games || [])
    .map((game) => String(game?.date || ""))
    .filter(Boolean)
    .sort();
  return dates.at(-1) || currentCalendar?.startDate || "";
}

function calendarVisibleDates() {
  if (!currentCalendar?.startDate) return [];
  const base = currentCalendar.startDate;

  if (calendarExpanded) {
    const latest = latestCalendarGameDate();
    const span = Math.max(14, isoDayDistance(base, latest) + 1);
    const days = Math.ceil(span / 7) * 7;
    return Array.from({ length: days }, (_, index) => addIsoDays(base, index));
  }

  const start = calendarWindowStart || base;
  return Array.from({ length: 14 }, (_, index) => addIsoDays(start, index));
}

function syncCalendarExpansionUi() {
  els.calendarCard?.classList.toggle("is-expanded", calendarExpanded);
  els.calendarCard?.setAttribute("aria-expanded", String(calendarExpanded));
  if (els.calendarTitle) {
    els.calendarTitle.textContent = calendarExpanded ? "Full Schedule" : "14-Day Calendar";
  }
}

function renderCalendarGrid() {
  if (!currentCalendar?.startDate) return;
  els.calendarGrid.replaceChildren();

  const gamesByDate = new Map();
  for (const game of currentCalendar.games || []) {
    const list = gamesByDate.get(game.date) || [];
    list.push(game);
    gamesByDate.set(game.date, list);
  }

  for (const date of calendarVisibleDates()) {
    const games = gamesByDate.get(date) || [];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = date;
    button.disabled = games.length === 0;
    button.setAttribute("aria-selected", String(date === selectedCalendarDate));

    const weekday = document.createElement("span");
    weekday.className = "calendar-weekday";
    weekday.textContent = dateDisplay(date, { weekday: "short" });

    const day = document.createElement("strong");
    day.className = "calendar-number";
    day.textContent = dateDisplay(date, { day: "numeric" });

    const signal = document.createElement("span");
    signal.className = games.length ? "calendar-signal has-game" : "calendar-signal";
    signal.textContent = games.length > 1 ? String(games.length) : games.length ? "•" : "";

    button.append(weekday, day, signal);

    if (games.length) {
      const weatherGame = [...games].sort((a, b) => gameWeatherRank(b) - gameWeatherRank(a))[0];
      const weather = document.createElement("span");
      weather.className = "calendar-mini-weather";
      weather.textContent = weatherGame.weather
        ? `${weatherGlyph(weatherGame.weather.weatherCode)} ${weatherGame.weather.rainProbability ?? "—"}%`
        : "⚽";
      button.append(weather);
    }

    button.addEventListener("click", () => selectCalendarDate(date, { scrollToSpotlight: true }));
    els.calendarGrid.append(button);
  }
}

function ensureCalendarDateVisible(date) {
  if (!currentCalendar?.startDate || calendarExpanded || !date) return false;

  const base = currentCalendar.startDate;
  let start = calendarWindowStart || base;
  let end = addIsoDays(start, 13);

  while (date > end) {
    start = addIsoDays(start, 7);
    end = addIsoDays(start, 13);
  }
  while (date < start && start > base) {
    const candidate = addIsoDays(start, -7);
    start = candidate < base ? base : candidate;
  }

  if (start === calendarWindowStart) return false;
  calendarWindowStart = start;
  renderCalendarGrid();
  return true;
}

function selectCalendarDate(date, { scrollToSpotlight = false } = {}) {
  if (!currentCalendar) return;
  const games = (currentCalendar.games || []).filter((game) => game.date === date);
  if (!games.length) return;

  selectedCalendarDate = date;
  ensureCalendarDateVisible(date);
  for (const button of els.calendarGrid.querySelectorAll(".calendar-day")) {
    button.setAttribute("aria-selected", String(button.dataset.date === date));
  }

  const game = games[0];
  selectedCalendarGameId = game.id || "";
  renderCalendarGamePicker(games, game.id || "");
  renderNextGame(game, "SELECTED GAME");
  els.nextGameCard.classList.add("spotlight-selected");
  syncSpotlightEdgeControls();

  if (scrollToSpotlight) {
    els.nextGameCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function calendarGameDates() {
  if (!currentCalendar?.startDate) return [];
  const firstDate = currentCalendar.startDate;
  return [...new Set(
    (currentCalendar.games || [])
      .map((game) => game.date)
      .filter((date) => date >= firstDate),
  )].sort();
}

function adjacentCalendarSelection(direction) {
  const gameDates = calendarGameDates();
  if (!gameDates.length || !direction) return null;

  const currentDate = selectedCalendarDate || currentNextGame?.date || gameDates[0];
  let currentIndex = gameDates.indexOf(currentDate);
  if (currentIndex < 0) currentIndex = direction > 0 ? -1 : gameDates.length;

  const targetDate = gameDates[currentIndex + Math.sign(direction)];
  if (!targetDate) return null;

  const game = (currentCalendar?.games || []).find((item) => item.date === targetDate);
  return game ? { date: targetDate, game } : null;
}

function selectAdjacentCalendarGameDate(direction) {
  const selection = adjacentCalendarSelection(direction);
  if (!selection) return false;
  selectCalendarDate(selection.date);
  return true;
}

function syncSpotlightEdgeControls() {
  els.spotlightPrevious.disabled = !adjacentCalendarSelection(-1);
  els.spotlightNext.disabled = !adjacentCalendarSelection(1);
}

function installSpotlightEdgeWaterfall() {
  const controls = [
    [els.spotlightPrevious, -1],
    [els.spotlightNext, 1],
  ];

  for (const [control, direction] of controls) {
    if (!control) continue;

    const reset = () => {
      control.style.setProperty("--edge-opacity", "0.10");
      control.style.setProperty("--edge-arrow-opacity", "0");
    };

    control.addEventListener("pointermove", (event) => {
      const rect = control.getBoundingClientRect();
      if (!rect.width) return;
      const local = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const fromBorder = direction < 0 ? local : rect.width - local;
      const strength = 1 - (fromBorder / rect.width);
      const eased = Math.max(0, Math.min(1, strength * strength));
      control.style.setProperty(
        "--edge-opacity",
        (0.10 + (0.88 * eased)).toFixed(3),
      );
      control.style.setProperty(
        "--edge-arrow-opacity",
        Math.max(0, (eased - 0.22) / 0.78).toFixed(3),
      );
    });

    control.addEventListener("pointerleave", reset);
    control.addEventListener("blur", reset);
    control.addEventListener("focus", () => {
      control.style.setProperty("--edge-opacity", "0.92");
      control.style.setProperty("--edge-arrow-opacity", "1");
    });
    reset();
  }
}

function installSpotlightSwipe() {
  let touchStartX = null;
  let touchStartY = null;
  let horizontalGesture = false;
  let train = null;
  let settling = false;

  const carousel = els.spotlightCarousel;
  const current = els.nextGameCard;

  const gap = () => {
    const value = Number.parseFloat(
      getComputedStyle(carousel).getPropertyValue("--spotlight-train-gap"),
    );
    return Number.isFinite(value) ? value : 12;
  };

  const clearInlineMotion = () => {
    current.classList.remove("is-train-dragging", "is-train-settling");
    current.style.removeProperty("transform");
    document.documentElement.classList.remove("spotlight-swipe-active");

    if (train?.preview) train.preview.remove();
    train = null;
  };

  const resetGesture = () => {
    clearInlineMotion();
    touchStartX = null;
    touchStartY = null;
    horizontalGesture = false;
    settling = false;
  };

  const prepareTrain = (direction) => {
    if (train?.direction === direction) return train;

    if (train?.preview) train.preview.remove();
    train = null;

    const target = adjacentCalendarSelection(direction);
    if (!target) return null;

    const preview = buildSpotlightTrainCard(target.game);
    carousel.append(preview);

    const distance = carousel.clientWidth + gap();
    const baseOffset = direction * distance;
    preview.style.transform = `translate3d(${baseOffset}px, 0, 0)`;

    current.classList.add("is-train-dragging");
    preview.classList.add("is-train-dragging");

    train = {
      direction,
      target,
      preview,
      distance,
      baseOffset,
    };
    return train;
  };

  const settleBack = () => {
    settling = true;
    current.classList.remove("is-train-dragging");
    current.classList.add("is-train-settling");
    current.style.transform = "translate3d(0, 0, 0)";

    if (train?.preview) {
      train.preview.classList.remove("is-train-dragging");
      train.preview.classList.add("is-train-settling");
      train.preview.style.transform = `translate3d(${train.baseOffset}px, 0, 0)`;
    }

    window.setTimeout(resetGesture, 270);
  };

  const completeTrain = () => {
    if (!train?.preview) {
      resetGesture();
      return;
    }

    settling = true;
    const committedTrain = train;
    current.classList.remove("is-train-dragging");
    committedTrain.preview.classList.remove("is-train-dragging");
    current.classList.add("is-train-settling");
    committedTrain.preview.classList.add("is-train-settling");

    current.style.transform =
      `translate3d(${-committedTrain.direction * committedTrain.distance}px, 0, 0)`;
    committedTrain.preview.style.transform = "translate3d(0, 0, 0)";

    window.setTimeout(() => {
      selectCalendarDate(committedTrain.target.date);

      current.classList.remove("is-train-settling");
      current.style.transition = "none";
      current.style.transform = "translate3d(0, 0, 0)";
      void current.offsetWidth;
      current.style.removeProperty("transition");

      resetGesture();
    }, 270);
  };

  const activateEdgeStep = (direction) => {
    if (settling) return;
    const activeTrain = prepareTrain(direction);
    if (!activeTrain) {
      syncSpotlightEdgeControls();
      return;
    }
    window.requestAnimationFrame(completeTrain);
  };

  els.spotlightPrevious.addEventListener("click", () => activateEdgeStep(-1));
  els.spotlightNext.addEventListener("click", () => activateEdgeStep(1));

  els.nextGameCard.addEventListener("touchstart", (event) => {
    if (settling || event.target.closest?.("a, button")) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    horizontalGesture = false;
  }, { passive: true });

  els.nextGameCard.addEventListener("touchmove", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch || touchStartX == null || touchStartY == null || settling) return;

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    if (!horizontalGesture) {
      if (Math.abs(deltaX) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) {
        resetGesture();
        return;
      }
      horizontalGesture = true;
      document.documentElement.classList.add("spotlight-swipe-active");
    }

    event.preventDefault();
    const direction = deltaX < 0 ? 1 : -1;
    const activeTrain = prepareTrain(direction);

    if (!activeTrain) {
      const resistedOffset = deltaX * 0.18;
      current.classList.add("is-train-dragging");
      current.style.transform = `translate3d(${resistedOffset}px, 0, 0)`;
      return;
    }

    const offset = Math.max(
      -activeTrain.distance,
      Math.min(activeTrain.distance, deltaX),
    );
    current.style.transform = `translate3d(${offset}px, 0, 0)`;
    activeTrain.preview.style.transform =
      `translate3d(${activeTrain.baseOffset + offset}px, 0, 0)`;
  }, { passive: false });

  els.nextGameCard.addEventListener("touchend", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch || touchStartX == null || touchStartY == null || settling) {
      if (!settling) resetGesture();
      return;
    }

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const isHorizontalSwipe =
      horizontalGesture &&
      Math.abs(deltaX) >= 56 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

    event.preventDefault();
    if (!isHorizontalSwipe || !train?.target) {
      settleBack();
      return;
    }

    completeTrain();
  }, { passive: false });

  els.nextGameCard.addEventListener("touchcancel", settleBack);
}

function setCalendarExpanded(expanded) {
  calendarExpanded = Boolean(expanded);
  syncCalendarExpansionUi();
  renderCalendarGrid();
}

function renderCalendar(calendar) {
  currentCalendar = calendar || null;
  els.calendarGrid.replaceChildren();

  if (!calendar?.startDate) {
    els.calendarGamePicker.hidden = true;
    els.calendarUpdated.textContent = "Weather unavailable";
    return;
  }

  if (!calendarWindowStart || calendarWindowStart < calendar.startDate) {
    calendarWindowStart = calendar.startDate;
  }

  const updated = new Date(calendar.updatedAt || "");
  els.calendarUpdated.textContent = Number.isNaN(updated.getTime())
    ? "Weather pending"
    : `Weather updated ${new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(updated)}`;

  const availableGames = calendar.games || [];
  const selectedGame = selectedCalendarGameId
    ? availableGames.find((game) => game.id === selectedCalendarGameId)
    : null;
  const firstGame = availableGames[0] || null;

  if (selectedGame) {
    selectedCalendarDate = selectedGame.date;
  } else if (firstGame) {
    selectedCalendarGameId = "";
    selectedCalendarDate = firstGame.date;
  } else {
    selectedCalendarGameId = "";
    selectedCalendarDate = "";
  }

  ensureCalendarDateVisible(selectedCalendarDate);
  syncCalendarExpansionUi();
  renderCalendarGrid();

  if (selectedGame) {
    const sameDay = availableGames.filter((game) => game.date === selectedGame.date);
    renderCalendarGamePicker(sameDay, selectedGame.id || "");
    renderNextGame(selectedGame, "SELECTED GAME");
    els.nextGameCard.classList.add("spotlight-selected");
  } else if (firstGame) {
    renderCalendarGamePicker(
      availableGames.filter((game) => game.date === firstGame.date),
      firstGame.id || "",
    );
    renderNextGame(firstGame, "NEXT GAME");
    els.nextGameCard.classList.remove("spotlight-selected");
  } else {
    els.calendarGamePicker.hidden = true;
    renderNextGame(null, "NEXT GAME");
  }

  syncSpotlightEdgeControls();
  window.requestAnimationFrame(syncSpotlightCardDimensions);
}

async function loadCalendar() {
  try {
    const [payload] = await Promise.all([
      api("/web/calendar"),
      loadRsvpStatus(),
    ]);
    renderCalendar(payload.calendar || null);
    return true;
  } catch (error) {
    currentCalendar = null;
    els.calendarGrid.replaceChildren();
    els.calendarGamePicker.hidden = true;
    els.calendarUpdated.textContent = "Calendar offline";
    syncSpotlightEdgeControls();
    await loadNextGame();
    return false;
  }
}

async function refreshLiveData() {
  if (liveRefreshInFlight || document.hidden) return;
  liveRefreshInFlight = true;
  setSystemState("checking");
  try {
    const [calendarOk, boardOk] = await Promise.all([loadCalendar(), loadBoard()]);
    setSystemState(calendarOk && boardOk ? "live" : "offline");
  } catch {
    setSystemState("offline");
  } finally {
    liveRefreshInFlight = false;
  }
}

async function checkForAppUpdate() {
  const registration = serviceWorkerRegistration ||
    await navigator.serviceWorker?.getRegistration("./").catch(() => null);
  if (!registration) return;
  serviceWorkerRegistration = registration;
  await registration.update().catch(() => null);
}

async function loadNextGame() {
  try {
    const payload = await api("/web/next-game");
    renderNextGame(payload.game || null);
    return true;
  } catch (error) {
    els.nextGameTitle.textContent = "Next game unavailable";
    els.nextGameType.textContent = "Offline";
    els.nextGameMeta.textContent = "";
    els.nextGameLocation.textContent = "";
    els.nextGameActions.hidden = true;
    els.nextGameHint.textContent = error.message;
    return false;
  }
}

function matchSourceState(game) {
  if (!game?.id) return null;
  return {
    id: game.id,
    date: game.sourceDate || game.date || "",
    startTime: game.sourceStartTime || game.startTime || "",
    endTime: game.sourceEndTime || game.endTime || "",
    location: game.sourceLocation || game.sourceAddress || game.location || "",
    address: game.sourceAddress || "",
    mapsQuery: game.sourceMapsQuery || game.sourceAddress || game.sourceLocation || "",
  };
}

function sourceGameView(game, source = matchOverrideSourceState) {
  if (!game || !source?.date) return game;
  const startTime = source.startTime || "";
  const endTime = source.endTime || "";
  const time = startTime && endTime
    ? `${startTime}–${endTime}`
    : (startTime || endTime);
  return {
    ...game,
    date: source.date,
    dateLabel: dateDisplay(source.date, {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    }),
    startTime,
    endTime,
    time,
    location: source.location || "",
    address: source.address || "",
    mapsQuery: source.mapsQuery || source.location || "",
    overrideActive: false,
    overrideUpdatedAt: "",
  };
}

function fillMatchOverrideForm(source) {
  if (!source) return;
  els.matchOverrideDate.value = source.date || "";
  els.matchOverrideStart.value = inputClockValue(source.startTime || "");
  els.matchOverrideEnd.value = inputClockValue(source.endTime || "");
  els.matchOverrideLocation.value = source.location || "";
}

function updateLocalCalendarGame(game) {
  if (!game?.id || !Array.isArray(currentCalendar?.games)) return;
  const index = currentCalendar.games.findIndex((item) => item.id === game.id);
  if (index < 0) return;
  currentCalendar.games[index] = game;
  selectedCalendarGameId = game.id;
  selectedCalendarDate = game.date;
  renderCalendarGrid();
  renderCalendarGamePicker(
    currentCalendar.games.filter((item) => item.date === game.date),
    game.id,
  );
}

function inputClockValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = String(match[3] || "").toUpperCase();
  if (suffix) {
    hour = (hour % 12) + (suffix === "PM" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function matchAdminSettings(pendingAction = "match-override") {
  if (!ownerToken()) {
    await openSettings({ pendingAction });
    els.ownerLoginStatus.textContent =
      pendingAction === "match-delete"
        ? "Administrator sign-in is required. After sign-in, BallerWatch will return to the delete action."
        : "Administrator sign-in is required. After sign-in, BallerWatch will return to the match editor.";
    return null;
  }
  if (currentUserSettings?.canManageMatches) return currentUserSettings;

  try {
    const payload = await api("/web/user/settings", {
      headers: ownerHeaders(),
      retryNetwork: true,
    });
    showOwnerSettings(payload.settings || {});
    if (!payload.settings?.canManageMatches) {
      els.nextGameHint.textContent = "Only the administrator can override match details.";
      return null;
    }
    return payload.settings;
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      await openSettings({ pendingAction });
      els.ownerLoginStatus.textContent =
        pendingAction === "match-delete"
          ? "Administrator sign-in is required. After sign-in, BallerWatch will return to the delete action."
          : "Administrator sign-in is required. After sign-in, BallerWatch will return to the match editor.";
    } else {
      els.nextGameHint.textContent = error.message;
    }
    return null;
  }
}

function closeMatchCardMenu() {
  els.nextGameMenu.hidden = true;
  els.nextGameMenuTrigger.setAttribute("aria-expanded", "false");
}

function toggleMatchCardMenu() {
  if (!currentNextGame?.id) return;
  const willOpen = els.nextGameMenu.hidden;
  els.nextGameMenu.hidden = !willOpen;
  els.nextGameMenuTrigger.setAttribute("aria-expanded", String(willOpen));
}

async function deleteSelectedMatch({ authorized = false } = {}) {
  if (!currentNextGame?.id) return;
  const settings = authorized ? currentUserSettings : await matchAdminSettings("match-delete");
  if (!settings?.canManageMatches) return;

  const game = { ...currentNextGame };
  const label = game.title || game.dateLabel || "this match";
  if (!window.confirm(
    `Delete ${label} from BallerWatch?\n\nThis hides the match in BallerWatch only. The RSVP/RATS source and Google Calendar are not deleted.`,
  )) {
    return;
  }

  closeMatchCardMenu();
  try {
    const payload = await api("/web/user/match", {
      method: "DELETE",
      headers: ownerHeaders(),
      retryNetwork: true,
      body: JSON.stringify({
        id: game.id,
        label: [game.title || "", game.dateLabel || ""].filter(Boolean).join(" — "),
        date: game.date || "",
      }),
    });
    if (currentUserSettings) {
      currentUserSettings = {
        ...currentUserSettings,
        deletedMatches: payload.deletedMatches || [],
      };
    }
    await loadCalendar();
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      await openSettings({ pendingAction: "match-delete" });
      els.ownerLoginStatus.textContent =
        "Sign in again. BallerWatch will return to the delete action.";
    } else {
      els.nextGameHint.textContent = error.message;
    }
  }
}

async function restoreDeletedMatch(id) {
  if (!id) return;
  try {
    const payload = await api("/web/user/match", {
      method: "POST",
      headers: ownerHeaders(),
      retryNetwork: true,
      body: JSON.stringify({ id }),
    });
    if (currentUserSettings) {
      currentUserSettings = {
        ...currentUserSettings,
        deletedMatches: payload.deletedMatches || [],
      };
      showOwnerSettings(currentUserSettings);
    }
    await loadCalendar();
  } catch (error) {
    els.ownerSettingsStatus.textContent = error.message;
  }
}

async function openMatchOverrideEditor({ authorized = false } = {}) {
  if (!currentNextGame?.id) {
    els.nextGameHint.textContent = "Select a match before editing.";
    return;
  }
  const settings = authorized ? currentUserSettings : await matchAdminSettings("match-override");
  if (!settings?.canManageMatches) return;

  matchOverrideSourceState = matchSourceState(currentNextGame);
  els.matchOverrideTitle.textContent = currentNextGame.title || "Edit selected match";
  els.matchOverrideCopy.textContent = currentNextGame.overrideActive
    ? "Manual values are active. Edit them, or reset immediately to the discovered source values."
    : "Edit the match below. Reset always restores the discovered source values.";
  els.matchOverrideDate.value = currentNextGame.date || "";
  els.matchOverrideStart.value = inputClockValue(currentNextGame.startTime || "");
  els.matchOverrideEnd.value = inputClockValue(currentNextGame.endTime || "");
  els.matchOverrideLocation.value =
    currentNextGame.location || currentNextGame.address || "";
  els.matchOverrideReset.disabled = !matchOverrideSourceState;
  els.matchOverrideStatus.textContent = currentNextGame.overrideActive
    ? "Manual values active."
    : "";
  els.matchOverrideDialog.showModal();
}

async function saveMatchOverride(event) {
  event.preventDefault();
  if (!currentNextGame?.id) return;
  const button = els.matchOverrideForm.querySelector('button[type="submit"]');
  button.disabled = true;
  els.matchOverrideReset.disabled = true;
  els.matchOverrideStatus.textContent = "Saving…";
  try {
    await api("/web/user/match-override", {
      method: "POST",
      headers: ownerHeaders(),
      retryNetwork: true,
      body: JSON.stringify({
        id: currentNextGame.id,
        date: els.matchOverrideDate.value,
        startTime: els.matchOverrideStart.value,
        endTime: els.matchOverrideEnd.value,
        location: els.matchOverrideLocation.value.trim(),
      }),
    });
    els.matchOverrideStatus.textContent = "Saved.";
    await loadCalendar();
    window.setTimeout(() => {
      if (els.matchOverrideDialog.open) els.matchOverrideDialog.close();
    }, 180);
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      els.matchOverrideDialog.close();
      await openSettings();
      els.ownerLoginStatus.textContent = "Sign in again to edit match overrides.";
    } else {
      els.matchOverrideStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
    els.matchOverrideReset.disabled = !matchOverrideSourceState;
  }
}

async function resetMatchOverride() {
  if (!currentNextGame?.id || !matchOverrideSourceState) return;

  const persistedOverride = Boolean(currentNextGame.overrideActive);
  const matchId = currentNextGame.id;
  const restored = sourceGameView(currentNextGame, matchOverrideSourceState);

  fillMatchOverrideForm(matchOverrideSourceState);
  renderNextGame(restored, els.spotlightLabel.textContent || "SELECTED GAME");
  updateLocalCalendarGame(restored);
  els.matchOverrideReset.disabled = false;
  els.matchOverrideCopy.textContent =
    "Source values are shown. Change anything and Save, or close the editor.";
  els.matchOverrideStatus.textContent = persistedOverride
    ? "Source values restored locally. Removing saved values…"
    : "Source values restored.";

  if (!persistedOverride) return;

  try {
    await api("/web/user/match-override", {
      method: "DELETE",
      headers: ownerHeaders(),
      retryNetwork: true,
      body: JSON.stringify({ id: matchId }),
    });
    els.matchOverrideStatus.textContent = "Source values restored.";
    await loadCalendar();
    const refreshed = (currentCalendar?.games || []).find((item) => item.id === matchId);
    if (refreshed) {
      matchOverrideSourceState = matchSourceState(refreshed);
      renderNextGame(refreshed, els.spotlightLabel.textContent || "SELECTED GAME");
      fillMatchOverrideForm(matchOverrideSourceState);
    }
  } catch (error) {
    els.matchOverrideStatus.textContent =
      `Source is shown locally, but the saved values could not be removed: ${error.message}`;
  }
}

async function shareNextGame() {
  if (!currentNextGame) return;
  const maps = googleMapsUrl(currentNextGame.mapsQuery);
  const text = currentNextGame.shareText || currentNextGame.title || "BallerWatch game";

  try {
    if (navigator.share) {
      await navigator.share({
        title: "BallerWatch game",
        text,
        ...(maps ? { url: maps } : {}),
      });
      els.nextGameHint.textContent = "Shared.";
      return;
    }

    await navigator.clipboard.writeText([text, maps].filter(Boolean).join("\n"));
    els.nextGameHint.textContent = "Game details copied.";
  } catch (error) {
    if (error?.name !== "AbortError") {
      els.nextGameHint.textContent = "Unable to share from this device.";
    }
  }
}

async function scheduleTestNotification() {
  els.testNotification.disabled = true;
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Notifications are not supported on this device.");
    }
    if (ios() && !standalone()) {
      els.installDialog.showModal();
      throw new Error("Open BallerWatch from its Home Screen icon first.");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active || registration.waiting || registration.installing;
    if (!worker) throw new Error("Notification service worker is not ready.");

    worker.postMessage({
      type: "ballerwatch:test-notification",
      delayMs: 5_000,
    });
    els.testNotificationStatus.textContent = "Test scheduled.";
  } catch (error) {
    els.testNotificationStatus.textContent = error.message;
  } finally {
    els.testNotification.disabled = false;
  }
}

async function loadBoard() {
  els.refresh.disabled = true;
  try {
    const payload = await api("/web/board?limit=30");
    renderBoard(payload.entries || []);
    return true;
  } catch (error) {
    els.board.replaceChildren();
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = error.message;
    els.board.append(message);
    return false;
  } finally {
    els.refresh.disabled = false;
  }
}

function openNotifications() {
  els.notificationDialog.showModal();
  void loadBoard();
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function setPushUi({ status, enabled, toggleDisabled = false, color = "" }) {
  els.bellPushStatus.textContent = enabled ? "On" : "Off";
  els.bellPushStatus.title = status || "";
  els.bellPushStatus.style.color = color;
  els.bellPushToggle.checked = enabled;
  els.bellPushToggle.disabled = toggleDisabled;
}

async function updatePushStatus() {
  if (!("Notification" in window) || !("PushManager" in window)) {
    setPushUi({
      status: "Unsupported",
      enabled: false,
      toggleDisabled: true,
    });
    return;
  }

  let subscription = await currentSubscription().catch(() => null);
  if (subscription && config?.push?.applicationServerKey && !subscriptionMatchesConfig(subscription)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }

  if (subscription) {
    setPushUi({
      status: "On",
      enabled: true,
      color: "#86efac",
    });
  } else if (Notification.permission === "denied") {
    setPushUi({
      status: "Blocked",
      enabled: false,
      toggleDisabled: true,
    });
  } else {
    setPushUi({
      status: "Off",
      enabled: false,
    });
  }
}

async function enablePush() {
  try {
    if (ios() && !standalone()) {
      els.installDialog.showModal();
      throw new Error("Open BallerWatch from its Home Screen icon first.");
    }
    if (!config?.push?.ready || !config.push.applicationServerKey) {
      await loadConfig();
    }
    if (!config?.push?.ready) throw new Error("Web Push setup is still initializing.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !subscriptionMatchesConfig(subscription)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.push.applicationServerKey),
      });
    }
    const serialized = subscription.toJSON();
    const challenge = await api("/web/push/challenge", {
      method: "POST",
      body: JSON.stringify({ endpoint: serialized.endpoint }),
    });
    await api("/web/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        subscription: serialized,
        challenge: challenge.challenge,
      }),
    });
  } catch (error) {
    els.bellPushStatus.title = error.message;
  } finally {
    await updatePushStatus();
  }
}

async function disablePush() {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    const serialized = subscription.toJSON();
    const challenge = await api("/web/push/challenge", {
      method: "POST",
      body: JSON.stringify({ endpoint: serialized.endpoint }),
    }).catch(() => null);
    if (challenge?.challenge) {
      await api("/web/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({
          subscription: serialized,
          challenge: challenge.challenge,
        }),
      }).catch(() => null);
    }
    await subscription.unsubscribe();
  } finally {
    await updatePushStatus();
  }
}

function nextFeedbackId() {
  if (globalThis.crypto?.randomUUID) {
    return `web-feedback:${globalThis.crypto.randomUUID()}`;
  }
  return `web-feedback:${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function toggleWrongAnswerFeedback() {
  if (!lastAnswerExchange || feedbackInFlight) return;

  const wasSubmitted = feedbackSubmitted;
  if (!feedbackId) feedbackId = nextFeedbackId();
  feedbackInFlight = true;
  els.answer.classList.add("answer-feedback-pending");
  els.answerFeedbackStatus.hidden = false;
  els.answerFeedbackStatus.textContent = wasSubmitted
    ? "Canceling feedback…"
    : "Saving this answer for review…";

  try {
    await api("/web/feedback", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify({
        action: wasSubmitted ? "cancel" : "mark",
        feedbackId,
        feedbackToken: lastAnswerExchange.feedbackToken || "",
        question: lastAnswerExchange.question,
        reply: lastAnswerExchange.reply,
        intent: lastAnswerExchange.intent || "",
      }),
    });

    els.answer.classList.remove("answer-feedback-pending");
    if (wasSubmitted) {
      feedbackSubmitted = false;
      feedbackId = "";
      els.answer.classList.remove("answer-feedback-sent");
      els.answerFeedbackStatus.textContent = "Feedback canceled.";
    } else {
      feedbackSubmitted = true;
      els.answer.classList.add("answer-feedback-sent");
      els.answerFeedbackStatus.textContent = "Saved for the next engineering review.";
    }
  } catch (error) {
    feedbackSubmitted = wasSubmitted;
    els.answer.classList.remove("answer-feedback-pending");
    if (wasSubmitted) {
      els.answer.classList.add("answer-feedback-sent");
    } else {
      feedbackId = "";
      els.answer.classList.remove("answer-feedback-sent");
    }

    els.answerFeedbackStatus.textContent = error.status === 401
      ? "Feedback expired. Ask the question again, then double-click or press and hold the new reply."
      : error.message;
  } finally {
    feedbackInFlight = false;
    }
}

function toggleCalendarExpandedFromEvent(event) {
  if (event?.target?.closest?.("button, a, input, textarea, select, label")) return;
  setCalendarExpanded(!calendarExpanded);
}

els.calendarCard?.addEventListener("click", toggleCalendarExpandedFromEvent);

installSpotlightSwipe();
installSpotlightEdgeWaterfall();

els.question.addEventListener("input", renderQuestionSuggestions);
els.question.addEventListener("focus", renderQuestionSuggestions);
els.question.addEventListener("keydown", (event) => {
  if (els.questionSuggestions.hidden) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestionSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestionSelection(-1);
  } else if (
    (event.key === "Tab" || event.key === "ArrowRight") &&
    activeSuggestionIndex < 0 &&
    els.question.selectionStart === els.question.value.length
  ) {
    event.preventDefault();
    selectQuestionSuggestion(0);
  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    selectQuestionSuggestion(activeSuggestionIndex);
  } else if (event.key === "Escape") {
    hideQuestionSuggestions();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".question-input-wrap")) hideQuestionSuggestions();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = els.question.value.trim();
  if (!question) return;
  hideQuestionSuggestions();
  const button = els.form.querySelector("button");
  button.disabled = true;
  els.answer.hidden = false;
  els.answer.textContent = "Thinking…";
  try {
    const payload = await api("/web/ask", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify({
        question,
        context: { lastDate: sessionStorage.getItem("ballerwatch-last-date") || "" },
      }),
    });
    els.answer.textContent = payload.reply;
    rememberQuestion(question);
    lastAnswerExchange = {
      question,
      reply: payload.reply,
      intent: payload.intent || "",
      feedbackToken: payload.feedbackToken || "",
    };
    feedbackSubmitted = false;
    feedbackId = "";
    feedbackInFlight = false;
    els.answer.classList.remove("answer-feedback-pending", "answer-feedback-sent");
    els.answerFeedbackStatus.hidden = true;
    els.answerFeedbackStatus.textContent = "";
      if (payload.lastDate) sessionStorage.setItem("ballerwatch-last-date", payload.lastDate);
  } catch (error) {
    lastAnswerExchange = null;
    feedbackSubmitted = false;
    feedbackId = "";
    feedbackInFlight = false;
    els.answerFeedbackStatus.hidden = true;
    els.answer.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

const ANSWER_FEEDBACK_HOLD_MS = 650;
const ANSWER_FEEDBACK_MOVE_TOLERANCE_PX = 12;
let answerFeedbackHoldTimer = null;
let answerFeedbackPointerId = null;
let answerFeedbackStartX = 0;
let answerFeedbackStartY = 0;

function clearAnswerFeedbackHold() {
  if (answerFeedbackHoldTimer !== null) {
    window.clearTimeout(answerFeedbackHoldTimer);
    answerFeedbackHoldTimer = null;
  }
  answerFeedbackPointerId = null;
}

els.answer.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.pointerType === "mouse" || !lastAnswerExchange || feedbackInFlight) return;
  clearAnswerFeedbackHold();
  answerFeedbackPointerId = event.pointerId;
  answerFeedbackStartX = event.clientX;
  answerFeedbackStartY = event.clientY;
  answerFeedbackHoldTimer = window.setTimeout(() => {
    answerFeedbackHoldTimer = null;
    answerFeedbackPointerId = null;
    void toggleWrongAnswerFeedback();
  }, ANSWER_FEEDBACK_HOLD_MS);
});

els.answer.addEventListener("pointermove", (event) => {
  if (event.pointerId !== answerFeedbackPointerId) return;
  const moved = Math.hypot(
    event.clientX - answerFeedbackStartX,
    event.clientY - answerFeedbackStartY,
  );
  if (moved > ANSWER_FEEDBACK_MOVE_TOLERANCE_PX) clearAnswerFeedbackHold();
});

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  els.answer.addEventListener(eventName, clearAnswerFeedbackHold);
}

els.answer.addEventListener("dblclick", (event) => {
  event.preventDefault();
  void toggleWrongAnswerFeedback();
});
els.answer.addEventListener("contextmenu", (event) => event.preventDefault());
els.answer.addEventListener("selectstart", (event) => event.preventDefault());

els.nextGameEdit.addEventListener("click", () => void openMatchOverrideEditor());
els.nextGameMenuTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMatchCardMenu();
});
els.nextGameMenuEdit.addEventListener("click", () => {
  closeMatchCardMenu();
  void openMatchOverrideEditor();
});
els.nextGameMenuDelete.addEventListener("click", () => {
  closeMatchCardMenu();
  void deleteSelectedMatch();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".match-card-menu-wrap")) closeMatchCardMenu();
});
els.deletedMatchList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore-match-id]");
  if (button?.dataset?.restoreMatchId) void restoreDeletedMatch(button.dataset.restoreMatchId);
});
els.matchOverrideForm.addEventListener("submit", saveMatchOverride);
els.matchOverrideReset.addEventListener("click", resetMatchOverride);
els.matchOverrideCancel.addEventListener("click", () => els.matchOverrideDialog.close());
els.closeMatchOverride.addEventListener("click", () => els.matchOverrideDialog.close());

els.notificationBell.addEventListener("click", openNotifications);
els.settingsButton.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", () => els.settingsDialog.close());
els.ownerLoginForm.addEventListener("submit", loginOwnerDevice);
els.ownerSettingsForm.addEventListener("submit", saveOwnerSettings);
els.ownerPasswordForm.addEventListener("submit", saveOwnerPassword);
els.userCreateForm.addEventListener("submit", createManagedUser);
els.promoteRelease.addEventListener("click", promoteProductionRelease);
els.userList.addEventListener("click", (event) => {
  const button = event.target.closest(".user-remove");
  if (button?.dataset?.username) void removeManagedUser(button.dataset.username);
});
els.ownerDisconnect.addEventListener("click", disconnectOwnerDevice);
els.ownerRevoke.addEventListener("click", revokeOwnerDevices);
els.nextGameShare.addEventListener("click", shareNextGame);
els.testNotification.addEventListener("click", scheduleTestNotification);
els.deleteAllNotifications.addEventListener("click", deleteAllNotifications);
els.closeNotifications.addEventListener("click", () => els.notificationDialog.close());
els.closeNotificationReader.addEventListener("click", closeNotificationReader);
els.refresh.addEventListener("click", loadBoard);
els.bellPushToggle.addEventListener("change", async () => {
  const requested = els.bellPushToggle.checked;
  els.bellPushToggle.disabled = true;
  if (requested) {
    await enablePush();
  } else {
    await disablePush();
  }
  await updatePushStatus();
});
els.installHelp?.addEventListener("click", () => els.installDialog.showModal());

let spotlightResizeTimer = null;
window.addEventListener("resize", () => {
  window.clearTimeout(spotlightResizeTimer);
  spotlightResizeTimer = window.setTimeout(() => {
    window.requestAnimationFrame(syncSpotlightCardDimensions);
  }, 120);
});

window.addEventListener("online", () => {
  setSystemState("checking");
  refreshLiveData().catch(() => null);
  checkForAppUpdate().catch(() => null);
});
window.addEventListener("offline", () => setSystemState("offline"));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (appRefreshDeferred && initialLoadComplete) {
    window.location.reload();
    return;
  }
  refreshLiveData().catch(() => null);
  checkForAppUpdate().catch(() => null);
});

document.documentElement.classList.toggle("is-standalone", standalone());
applyInstallState();
setSystemState("checking");
const [, configOk, boardOk, calendarOk] = await Promise.all([
  registerServiceWorker().catch(() => null),
  loadConfig(),
  loadBoard(),
  loadCalendar(),
]);
setSystemState(configOk && boardOk && calendarOk ? "live" : "offline");
initialLoadComplete = true;
await updatePushStatus();

window.setInterval(() => {
  refreshLiveData().catch(() => null);
}, LIVE_DATA_REFRESH_MS);

window.setInterval(() => {
  if (document.visibilityState === "visible") {
    checkForAppUpdate().catch(() => null);
  }
}, APP_UPDATE_CHECK_MS);

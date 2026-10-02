const API = "https://ballerwatch-telegram.vudhone.workers.dev";

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
  settingsPairView: document.querySelector("#settings-pair-view"),
  settingsOwnerView: document.querySelector("#settings-owner-view"),
  ownerLoginForm: document.querySelector("#owner-login-form"),
  ownerLoginPassword: document.querySelector("#owner-login-password"),
  ownerLoginStatus: document.querySelector("#owner-login-status"),
  ownerPairForm: document.querySelector("#owner-pair-form"),
  ownerPairCode: document.querySelector("#owner-pair-code"),
  ownerPairStatus: document.querySelector("#owner-pair-status"),
  ownerSettingsForm: document.querySelector("#owner-settings-form"),
  ownerName: document.querySelector("#owner-name"),
  ownerTeams: document.querySelector("#owner-teams"),
  ownerSettingsStatus: document.querySelector("#owner-settings-status"),
  ownerPasswordForm: document.querySelector("#owner-password-form"),
  ownerPasswordNew: document.querySelector("#owner-password-new"),
  ownerPasswordConfirm: document.querySelector("#owner-password-confirm"),
  ownerPasswordStatus: document.querySelector("#owner-password-status"),
  ownerDisconnect: document.querySelector("#owner-disconnect"),
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
  answerFeedbackButton: document.querySelector("#answer-feedback-button"),
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
  nextGameMeta: document.querySelector("#next-game-meta"),
  nextGameLocation: document.querySelector("#next-game-location"),
  nextGameCapacity: document.querySelector("#next-game-capacity"),
  nextGameCapacityLabel: document.querySelector("#next-game-capacity-label"),
  nextGameCapacitySpots: document.querySelector("#next-game-capacity-spots"),
  nextGameCapacityFill: document.querySelector("#next-game-capacity-fill"),
  nextGameWeather: document.querySelector("#next-game-weather"),
  nextGameActions: document.querySelector("#next-game-actions"),
  nextGameDirections: document.querySelector("#next-game-directions"),
  nextGameShare: document.querySelector("#next-game-share"),
  nextGameHint: document.querySelector("#next-game-hint"),
  testNotification: document.querySelector("#test-notification"),
  deleteAllNotifications: document.querySelector("#delete-all-notifications"),
  testNotificationStatus: document.querySelector("#test-notification-status"),
  calendarGrid: document.querySelector("#calendar-grid"),
  calendarGamePicker: document.querySelector("#calendar-game-picker"),
  calendarUpdated: document.querySelector("#calendar-updated"),
};

let config = null;
let currentNextGame = null;
let currentCalendar = null;
let currentBoardEntries = [];
let selectedCalendarDate = "";
let selectedCalendarGameId = "";
let serviceWorkerRegistration = null;
let liveRefreshInFlight = false;
let initialLoadComplete = false;
let appRefreshDeferred = false;
let activeSuggestionIndex = -1;
let lastAnswerExchange = null;
let feedbackSubmitted = false;
let feedbackId = "";
let feedbackInFlight = false;

const OWNER_TOKEN_KEY = "ballerwatch-owner-token";
const NOTIFICATION_READ_KEY = "ballerwatch-notification-read-v1";
const NOTIFICATION_DELETED_KEY = "ballerwatch-notification-deleted-v1";
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

const QUESTION_COMPLETIONS = [
  "What game is today?",
  "What game is tomorrow?",
  "What's my next game?",
  "What games are this week?",
  "What league teams are you monitoring?",
  ...WEEKDAYS.flatMap((day) => [
    `What's the pickup count for ${day}?`,
    `How many spots are left for ${day}?`,
    `What field is ${day}?`,
    `Where is ${day}'s game?`,
    `What time is ${day}?`,
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

function sentenceCompletionScore(candidate, query) {
  const cleanCandidate = String(candidate || "").toLowerCase();
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return 99;
  if (cleanCandidate.startsWith(cleanQuery)) return 0;

  const queryWords = normalizedWords(cleanQuery);
  const candidateWords = normalizedWords(cleanCandidate);
  let cursor = 0;
  for (const queryWord of queryWords) {
    let matched = false;
    while (cursor < candidateWords.length) {
      if (candidateWords[cursor].startsWith(queryWord)) {
        matched = true;
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    if (!matched) return 99;
  }
  return 1;
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
  return QUESTION_COMPLETIONS
    .map((value) => ({
      value,
      label: value,
      description: "",
      score: sentenceCompletionScore(value, lower),
    }))
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.value.length - b.value.length)
    .slice(0, 6);
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

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showPairSettings(message = "") {
  els.settingsPairView.hidden = false;
  els.settingsOwnerView.hidden = true;
  els.ownerLoginStatus.textContent = message;
  els.ownerPairStatus.textContent = "";
}

function showOwnerSettings(settings) {
  els.settingsPairView.hidden = true;
  els.settingsOwnerView.hidden = false;
  els.ownerName.value = settings?.ownerName || "";
  els.ownerTeams.value = Array.isArray(settings?.teams) ? settings.teams.join("\n") : "";
  els.ownerPasswordStatus.textContent = settings?.passwordConfigured
    ? "Owner password is set. New devices can sign in directly."
    : "Set an owner password so new devices can sign in without /webpair.";
}

async function loadOwnerSettings() {
  if (!ownerToken()) {
    showPairSettings();
    return;
  }

  els.ownerSettingsStatus.textContent = "Loading…";
  try {
    const payload = await api("/web/owner/settings", {
      headers: ownerHeaders(),
    });
    showOwnerSettings(payload.settings || {});
    els.ownerSettingsStatus.textContent = "";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showPairSettings("Sign in again to edit owner settings.");
      return;
    }
    showOwnerSettings({});
    els.ownerSettingsStatus.textContent = error.message;
  }
}

async function openSettings() {
  els.settingsDialog.showModal();
  await loadOwnerSettings();
}

async function loginOwnerDevice(event) {
  event.preventDefault();
  const password = els.ownerLoginPassword.value;
  const button = els.ownerLoginForm.querySelector("button");
  button.disabled = true;
  els.ownerLoginStatus.textContent = "Signing in…";
  try {
    const payload = await api("/web/owner/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    localStorage.setItem(OWNER_TOKEN_KEY, payload.token);
    els.ownerLoginPassword.value = "";
    await loadOwnerSettings();
  } catch (error) {
    els.ownerLoginStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function pairOwnerDevice(event) {
  event.preventDefault();
  const code = els.ownerPairCode.value.trim();
  const button = els.ownerPairForm.querySelector("button");
  button.disabled = true;
  els.ownerPairStatus.textContent = "Pairing…";
  try {
    const payload = await api("/web/owner/pair", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    localStorage.setItem(OWNER_TOKEN_KEY, payload.token);
    els.ownerPairCode.value = "";
    await loadOwnerSettings();
    if (!payload.passwordConfigured) {
      els.ownerPasswordStatus.textContent =
        "Paired. Set an owner password below so future devices can sign in directly.";
    }
  } catch (error) {
    els.ownerPairStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveOwnerSettings(event) {
  event.preventDefault();
  const button = els.ownerSettingsForm.querySelector("button");
  const teams = els.ownerTeams.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  button.disabled = true;
  els.ownerSettingsStatus.textContent = "Saving…";
  try {
    const payload = await api("/web/owner/settings", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify({
        ownerName: els.ownerName.value.trim(),
        teams,
      }),
    });
    showOwnerSettings(payload.settings || { ownerName: els.ownerName.value.trim(), teams });
    els.ownerSettingsStatus.textContent =
      "Saved. Monitoring updates on the next league refresh.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showPairSettings("Sign in again to edit owner settings.");
    } else {
      els.ownerSettingsStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
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
  els.ownerPasswordStatus.textContent = "Saving owner password…";
  try {
    const payload = await api("/web/owner/password", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify({ password }),
    });
    els.ownerPasswordNew.value = "";
    els.ownerPasswordConfirm.value = "";
    els.ownerPasswordStatus.textContent = payload.message ||
      "Owner password saved. New devices can now sign in directly.";
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      showPairSettings("Sign in again to change the owner password.");
    } else {
      els.ownerPasswordStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
  }
}

function disconnectOwnerDevice() {
  localStorage.removeItem(OWNER_TOKEN_KEY);
  showPairSettings("This device is signed out of private settings.");
}

function setSystemState(state) {
  const live = state === "live";
  els.system.textContent = live ? "Live" : "Offline";
  els.system.style.color = live ? "#86efac" : "#fde68a";
  els.systemLine?.classList.toggle("is-live", live);
  els.systemLine?.classList.toggle("is-offline", !live);
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

  const registration = await navigator.serviceWorker.register("./sw.js?v=5.6.0", {
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
    setSystemState("live");
    els.version.textContent = `BallerWatch v${config.version}`;
  } catch {
    setSystemState("offline");
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
      directions: "",
      actionsHidden: true,
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
    type: game.kind === "pickup" ? "Pickup" : "League",
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
    directions: googleMapsUrl(game.mapsQuery),
    actionsHidden: false,
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
  targets.actions.hidden = model.actionsHidden;
  targets.hint.textContent = "";

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
    meta: els.nextGameMeta,
    location: els.nextGameLocation,
    capacity: els.nextGameCapacity,
    capacityLabel: els.nextGameCapacityLabel,
    capacitySpots: els.nextGameCapacitySpots,
    capacityFill: els.nextGameCapacityFill,
    weather: els.nextGameWeather,
    actions: els.nextGameActions,
    directions: els.nextGameDirections,
    hint: els.nextGameHint,
  };
}

function renderNextGame(game, label = "NEXT GAME") {
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
      meta: role("next-game-meta"),
      location: role("next-game-location"),
      capacity: role("next-game-capacity"),
      capacityLabel: role("next-game-capacity-label"),
      capacitySpots: role("next-game-capacity-spots"),
      capacityFill: role("next-game-capacity-fill"),
      weather: role("next-game-weather"),
      actions: role("next-game-actions"),
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

function selectCalendarDate(date, { scrollToSpotlight = false } = {}) {
  if (!currentCalendar) return;
  const games = (currentCalendar.games || []).filter((game) => game.date === date);
  if (!games.length) return;

  selectedCalendarDate = date;
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
  const lastDate = addIsoDays(firstDate, 13);
  return [...new Set(
    (currentCalendar.games || [])
      .map((game) => game.date)
      .filter((date) => date >= firstDate && date <= lastDate),
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

function renderCalendar(calendar) {
  currentCalendar = calendar || null;
  els.calendarGrid.replaceChildren();

  if (!calendar?.startDate) {
    els.calendarGamePicker.hidden = true;
    els.calendarUpdated.textContent = "Weather unavailable";
    return;
  }

  const updated = new Date(calendar.updatedAt || "");
  els.calendarUpdated.textContent = Number.isNaN(updated.getTime())
    ? "Weather pending"
    : `Weather updated ${new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(updated)}`;

  const gamesByDate = new Map();
  for (const game of calendar.games || []) {
    const list = gamesByDate.get(game.date) || [];
    list.push(game);
    gamesByDate.set(game.date, list);
  }

  const dates = Array.from({ length: 14 }, (_, index) =>
    addIsoDays(calendar.startDate, index),
  );
  const firstGameDate = (calendar.games || [])[0]?.date || "";
  if (!selectedCalendarDate || !dates.includes(selectedCalendarDate)) {
    selectedCalendarDate = firstGameDate || calendar.startDate;
  }

  for (const date of dates) {
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

  const availableGames = calendar.games || [];
  const selectedGame = selectedCalendarGameId
    ? availableGames.find((game) => game.id === selectedCalendarGameId)
    : null;
  const firstGame = availableGames[0] || null;

  if (selectedGame) {
    selectedCalendarDate = selectedGame.date;
    const sameDay = availableGames.filter((game) => game.date === selectedGame.date);
    renderCalendarGamePicker(sameDay, selectedGame.id || "");
    renderNextGame(selectedGame, "SELECTED GAME");
    els.nextGameCard.classList.add("spotlight-selected");
  } else if (firstGame) {
    selectedCalendarGameId = "";
    selectedCalendarDate = firstGame.date;
    renderCalendarGamePicker(
      availableGames.filter((game) => game.date === firstGame.date),
      firstGame.id || "",
    );
    renderNextGame(firstGame, "NEXT GAME");
    els.nextGameCard.classList.remove("spotlight-selected");
  } else {
    selectedCalendarGameId = "";
    els.calendarGamePicker.hidden = true;
    renderNextGame(null, "NEXT GAME");
  }

  syncSpotlightEdgeControls();
  window.requestAnimationFrame(syncSpotlightCardDimensions);
}

async function loadCalendar() {
  try {
    const payload = await api("/web/calendar");
    renderCalendar(payload.calendar || null);
  } catch (error) {
    currentCalendar = null;
    els.calendarGrid.replaceChildren();
    els.calendarGamePicker.hidden = true;
    els.calendarUpdated.textContent = "Calendar offline";
    syncSpotlightEdgeControls();
    await loadNextGame();
  }
}

async function refreshLiveData() {
  if (liveRefreshInFlight || document.hidden) return;
  liveRefreshInFlight = true;
  try {
    await Promise.all([loadCalendar(), loadBoard()]);
    setSystemState("live");
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
  } catch (error) {
    els.nextGameTitle.textContent = "Next game unavailable";
    els.nextGameType.textContent = "Offline";
    els.nextGameMeta.textContent = "";
    els.nextGameLocation.textContent = "";
    els.nextGameActions.hidden = true;
    els.nextGameHint.textContent = error.message;
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
  } catch (error) {
    els.board.replaceChildren();
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = error.message;
    els.board.append(message);
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
    await api("/web/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON() }),
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
    await api("/web/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    }).catch(() => null);
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

function updateAnswerFeedbackButton() {
  const available = Boolean(lastAnswerExchange);
  els.answerFeedbackButton.hidden = !available;
  if (!available) return;
  els.answerFeedbackButton.disabled = feedbackInFlight;
  els.answerFeedbackButton.setAttribute("aria-pressed", String(feedbackSubmitted));
  els.answerFeedbackButton.textContent = feedbackInFlight
    ? (feedbackSubmitted ? "Undoing…" : "Saving…")
    : (feedbackSubmitted ? "Undo wrong answer" : "Wrong answer");
}

async function toggleWrongAnswerFeedback() {
  if (!lastAnswerExchange || feedbackInFlight) return;

  const wasSubmitted = feedbackSubmitted;
  if (!feedbackId) feedbackId = nextFeedbackId();
  feedbackInFlight = true;
  updateAnswerFeedbackButton();
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
      ? "Feedback expired. Ask the question again, then tap Wrong answer on the new reply."
      : error.message;
  } finally {
    feedbackInFlight = false;
    updateAnswerFeedbackButton();
  }
}

installSpotlightSwipe();

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
    lastAnswerExchange = {
      question,
      reply: payload.reply,
      feedbackToken: payload.feedbackToken || "",
    };
    feedbackSubmitted = false;
    feedbackId = "";
    feedbackInFlight = false;
    els.answer.classList.remove("answer-feedback-pending", "answer-feedback-sent");
    els.answerFeedbackStatus.hidden = true;
    els.answerFeedbackStatus.textContent = "";
    updateAnswerFeedbackButton();
    if (payload.lastDate) sessionStorage.setItem("ballerwatch-last-date", payload.lastDate);
  } catch (error) {
    lastAnswerExchange = null;
    feedbackSubmitted = false;
    feedbackId = "";
    feedbackInFlight = false;
    els.answerFeedbackStatus.hidden = true;
    els.answerFeedbackButton.hidden = true;
    els.answer.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

els.answerFeedbackButton.addEventListener("click", () => {
  void toggleWrongAnswerFeedback();
});
els.answer.addEventListener("dblclick", (event) => {
  event.preventDefault();
  void toggleWrongAnswerFeedback();
});
els.answer.addEventListener("contextmenu", (event) => event.preventDefault());
els.answer.addEventListener("selectstart", (event) => event.preventDefault());

els.notificationBell.addEventListener("click", openNotifications);
els.settingsButton.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", () => els.settingsDialog.close());
els.ownerLoginForm.addEventListener("submit", loginOwnerDevice);
els.ownerPairForm.addEventListener("submit", pairOwnerDevice);
els.ownerSettingsForm.addEventListener("submit", saveOwnerSettings);
els.ownerPasswordForm.addEventListener("submit", saveOwnerPassword);
els.ownerDisconnect.addEventListener("click", disconnectOwnerDevice);
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
  setSystemState("live");
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

applyInstallState();
await Promise.all([
  registerServiceWorker().catch(() => null),
  loadConfig(),
  loadBoard(),
  loadCalendar(),
]);
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

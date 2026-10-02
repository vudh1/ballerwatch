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
  ownerPairForm: document.querySelector("#owner-pair-form"),
  ownerPairCode: document.querySelector("#owner-pair-code"),
  ownerPairStatus: document.querySelector("#owner-pair-status"),
  ownerSettingsForm: document.querySelector("#owner-settings-form"),
  ownerName: document.querySelector("#owner-name"),
  ownerTeams: document.querySelector("#owner-teams"),
  ownerSettingsStatus: document.querySelector("#owner-settings-status"),
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
  answerFeedbackStatus: document.querySelector("#answer-feedback-status"),
  questionSuggestions: document.querySelector("#question-suggestions"),
  installCard: document.querySelector("#install-card"),
  installHelp: document.querySelector("#install-help"),
  installDialog: document.querySelector("#install-dialog"),
  nextGameCard: document.querySelector("#next-game-card"),
  spotlightLabel: document.querySelector("#spotlight-label"),
  nextGameTitle: document.querySelector("#next-game-title"),
  nextGameType: document.querySelector("#next-game-type"),
  nextGameMeta: document.querySelector("#next-game-meta"),
  nextGameLocation: document.querySelector("#next-game-location"),
  nextGameWeather: document.querySelector("#next-game-weather"),
  nextGameActions: document.querySelector("#next-game-actions"),
  nextGameDirections: document.querySelector("#next-game-directions"),
  nextGameShare: document.querySelector("#next-game-share"),
  nextGameHint: document.querySelector("#next-game-hint"),
  testNotification: document.querySelector("#test-notification"),
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
  els.ownerPairStatus.textContent = message;
}

function showOwnerSettings(settings) {
  els.settingsPairView.hidden = true;
  els.settingsOwnerView.hidden = false;
  els.ownerName.value = settings?.ownerName || "";
  els.ownerTeams.value = Array.isArray(settings?.teams) ? settings.teams.join("\n") : "";
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
      showPairSettings("Pair this device again to edit owner settings.");
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
      showPairSettings("Pair this device again to edit owner settings.");
    } else {
      els.ownerSettingsStatus.textContent = error.message;
    }
  } finally {
    button.disabled = false;
  }
}

function disconnectOwnerDevice() {
  localStorage.removeItem(OWNER_TOKEN_KEY);
  showPairSettings("This device is disconnected from private settings.");
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

  const registration = await navigator.serviceWorker.register("./sw.js?v=5.1.5", {
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

function deleteNotification(item) {
  const deleted = storedNotificationIds(NOTIFICATION_DELETED_KEY);
  deleted.add(notificationId(item));
  saveNotificationIds(NOTIFICATION_DELETED_KEY, deleted);
  renderBoard(currentBoardEntries);
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
    }, { passive: true });

    article.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch || touchStartX == null || touchStartY == null) return;
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      if (deltaX < -64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        event.preventDefault();
        deletedBySwipe = true;
        deleteNotification(item);
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

function renderNextGame(game, label = "NEXT GAME") {
  els.spotlightLabel.textContent = label;
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

  if (!game) {
    els.nextGameTitle.textContent = "No upcoming game";
    els.nextGameType.textContent = "None";
    els.nextGameMeta.textContent = "No pickup or RATS game is currently published.";
    els.nextGameLocation.textContent = "";
    els.nextGameWeather.hidden = true;
    els.nextGameWeather.textContent = "";
    els.nextGameActions.hidden = true;
    els.nextGameHint.textContent = "";
    return;
  }

  els.nextGameTitle.textContent = game.title || "Upcoming game";
  els.nextGameType.textContent = game.kind === "pickup" ? "Pickup" : "League";
  const capacityText = game.kind === "pickup" && game.reserved != null
    ? (
        game.capacity == null
          ? `${game.reserved} reserved`
          : `${game.reserved} / ${game.capacity} reserved`
      )
    : "";
  els.nextGameMeta.textContent = [
    game.dateLabel,
    game.time,
    capacityText,
  ].filter(Boolean).join(" • ");

  const locationParts = [];
  if (game.location) locationParts.push(game.location);
  if (game.address && game.address !== game.location) locationParts.push(game.address);
  if (game.jerseyColor) locationParts.push(`${game.jerseyColor} jersey`);
  els.nextGameLocation.textContent = locationParts.join(" • ");

  const weatherText = weatherSummary(
    game.weather,
    game.weatherStale,
    game.weatherApproximate,
  );
  els.nextGameWeather.textContent = weatherText;
  els.nextGameWeather.hidden = !weatherText;

  const directions = googleMapsUrl(game.mapsQuery);
  if (directions) {
    els.nextGameDirections.href = directions;
    els.nextGameDirections.hidden = false;
  } else {
    els.nextGameDirections.hidden = true;
  }

  els.nextGameActions.hidden = false;
  els.nextGameHint.textContent = "";
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

  if (scrollToSpotlight) {
    els.nextGameCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
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
  const destination =
    currentNextGame.mapsQuery ||
    currentNextGame.address ||
    currentNextGame.location ||
    "";
  const maps = googleMapsUrl(destination);

  try {
    if (navigator.share) {
      els.nextGameHint.textContent =
        "Choose Tesla in the share sheet to send this destination to your car.";
      await navigator.share({
        title: "Send to Tesla",
        text: destination || currentNextGame.title || "BallerWatch game",
        ...(maps ? { url: maps } : {}),
      });
      els.nextGameHint.textContent = "Destination shared.";
      return;
    }

    await navigator.clipboard.writeText(destination || maps);
    els.nextGameHint.textContent =
      "Destination copied. Open Tesla → Locations to send it to your car.";
    window.location.href = "https://ts.la/app";
  } catch (error) {
    if (error?.name !== "AbortError") {
      els.nextGameHint.textContent = "Unable to share this destination.";
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

async function toggleWrongAnswerFeedback() {
  if (!lastAnswerExchange || feedbackInFlight) return;

  if (!ownerToken()) {
    els.answerFeedbackStatus.hidden = false;
    els.answerFeedbackStatus.textContent =
      "Pair this device in Settings to send answer feedback.";
    await openSettings();
    return;
  }

  const wasSubmitted = feedbackSubmitted;
  if (!feedbackId) feedbackId = nextFeedbackId();
  feedbackInFlight = true;
  els.answer.classList.add("answer-feedback-pending");
  els.answerFeedbackStatus.hidden = false;
  els.answerFeedbackStatus.textContent = wasSubmitted
    ? "Canceling feedback…"
    : "Sending feedback…";

  try {
    await api("/web/feedback", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify(
        wasSubmitted
          ? {
              action: "cancel",
              feedbackId,
            }
          : {
              action: "mark",
              feedbackId,
              ...lastAnswerExchange,
            },
      ),
    });

    els.answer.classList.remove("answer-feedback-pending");
    if (wasSubmitted) {
      feedbackSubmitted = false;
      feedbackId = "";
      els.answer.classList.remove("answer-feedback-sent");
      els.answerFeedbackStatus.textContent =
        "Feedback canceled — double-tap/click to mark this answer wrong.";
    } else {
      feedbackSubmitted = true;
      els.answer.classList.add("answer-feedback-sent");
      els.answerFeedbackStatus.textContent =
        "Marked wrong — double-tap/click again to cancel.";
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

    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      els.answerFeedbackStatus.textContent =
        "Pair this device again to send answer feedback.";
      await openSettings();
    } else {
      els.answerFeedbackStatus.textContent = error.message;
    }
  } finally {
    feedbackInFlight = false;
  }
}

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
    lastAnswerExchange = { question, reply: payload.reply };
    feedbackSubmitted = false;
    feedbackId = "";
    feedbackInFlight = false;
    els.answer.classList.remove("answer-feedback-pending", "answer-feedback-sent");
    els.answerFeedbackStatus.hidden = false;
    els.answerFeedbackStatus.textContent =
      "Double-tap/click the answer to mark it wrong for the next review.";
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

els.answer.addEventListener("dblclick", (event) => {
  event.preventDefault();
  void toggleWrongAnswerFeedback();
});

els.notificationBell.addEventListener("click", openNotifications);
els.settingsButton.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", () => els.settingsDialog.close());
els.ownerPairForm.addEventListener("submit", pairOwnerDevice);
els.ownerSettingsForm.addEventListener("submit", saveOwnerSettings);
els.ownerDisconnect.addEventListener("click", disconnectOwnerDevice);
els.nextGameShare.addEventListener("click", shareNextGame);
els.testNotification.addEventListener("click", scheduleTestNotification);
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

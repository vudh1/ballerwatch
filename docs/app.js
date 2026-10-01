const API = "https://ballerwatch-telegram.vudhone.workers.dev";

const els = {
  system: document.querySelector("#system-status"),
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
  calendarDetail: document.querySelector("#calendar-detail"),
  calendarUpdated: document.querySelector("#calendar-updated"),
};

let config = null;
let currentNextGame = null;
let currentCalendar = null;
let selectedCalendarDate = "";
let activeSuggestionIndex = -1;
let lastAnswerExchange = null;
let feedbackSubmitted = false;
let answerHoldTimer = null;
let answerHoldStart = null;

const OWNER_TOKEN_KEY = "ballerwatch-owner-token";

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

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register("./sw.js?v=5.0.0", {
    scope: "./",
    updateViaCache: "none",
  });
  await registration.update().catch(() => null);
  return registration;
}

async function loadConfig() {
  try {
    config = await api("/web/config");
    els.system.textContent = "Live";
    els.system.style.color = "#86efac";
    els.version.textContent = `BallerWatch v${config.version}`;
  } catch {
    els.system.textContent = "Offline";
    els.system.style.color = "#fde68a";
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

function renderBoard(entries) {
  els.board.replaceChildren();
  updateNotificationBadge(entries.length);

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No web notifications yet.";
    els.board.append(empty);
    return;
  }

  for (const item of entries) {
    const article = document.createElement("article");
    article.className = "notice";

    const title = document.createElement("h3");
    title.textContent = item.title || "BallerWatch update";

    const body = document.createElement("p");
    body.textContent = item.body || "";

    const time = document.createElement("time");
    const date = new Date(item.createdAt);
    time.textContent = Number.isNaN(date.getTime())
      ? ""
      : new Intl.DateTimeFormat(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        }).format(date);

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

function weatherSummary(weather, stale = false) {
  if (!weather) return "";
  const parts = [
    weatherGlyph(weather.weatherCode),
    weather.condition || "",
    Number.isFinite(Number(weather.temperatureF)) ? `${Math.round(Number(weather.temperatureF))}°F` : "",
    Number.isFinite(Number(weather.rainProbability))
      ? `${Math.round(Number(weather.rainProbability))}% rain`
      : "",
    stale ? "cached" : "",
  ].filter(Boolean);
  return parts.join("  ");
}

function renderNextGame(game) {
  currentNextGame = game
    ? {
        ...game,
        shareText: game.shareText || [
          game.title,
          game.dateLabel,
          game.time,
          game.location,
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
  els.nextGameMeta.textContent = [game.dateLabel, game.time].filter(Boolean).join(" • ");

  const locationParts = [];
  if (game.location) locationParts.push(game.location);
  if (game.address && game.address !== game.location) locationParts.push(game.address);
  if (game.jerseyColor) locationParts.push(`${game.jerseyColor} jersey`);
  els.nextGameLocation.textContent = locationParts.join(" • ");

  const weatherText = weatherSummary(game.weather, game.weatherStale);
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

function renderCalendarDetail(date) {
  if (!currentCalendar) return;
  selectedCalendarDate = date;
  for (const button of els.calendarGrid.querySelectorAll(".calendar-day")) {
    button.setAttribute("aria-selected", String(button.dataset.date === date));
  }

  els.calendarDetail.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "calendar-detail-heading";
  const title = document.createElement("h3");
  title.textContent = dateDisplay(date, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  heading.append(title);
  els.calendarDetail.append(heading);

  const games = (currentCalendar.games || []).filter((game) => game.date === date);
  if (!games.length) {
    const empty = document.createElement("p");
    empty.className = "calendar-empty";
    empty.textContent = "No game scheduled.";
    els.calendarDetail.append(empty);
    return;
  }

  for (const game of games) {
    const article = document.createElement("article");
    article.className = "calendar-game";

    const main = document.createElement("div");
    main.className = "calendar-game-main";

    const gameTitle = document.createElement("strong");
    gameTitle.textContent = game.title || "Game";

    const meta = document.createElement("span");
    meta.textContent = [game.time, game.location].filter(Boolean).join(" · ");

    main.append(gameTitle, meta);

    if (game.kind === "pickup" && game.reserved != null) {
      const count = document.createElement("span");
      count.className = "calendar-game-count";
      count.textContent = game.capacity == null
        ? `${game.reserved} reserved`
        : `${game.reserved}/${game.capacity} reserved`;
      main.append(count);
    }
    if (game.jerseyColor) {
      const jersey = document.createElement("span");
      jersey.className = "calendar-game-count";
      jersey.textContent = `${game.jerseyColor} jersey`;
      main.append(jersey);
    }

    const side = document.createElement("div");
    side.className = "calendar-game-side";
    const weather = document.createElement("span");
    weather.className = "calendar-game-weather";
    weather.textContent = game.weather
      ? weatherSummary(game.weather, game.weatherStale)
      : "Weather pending";
    side.append(weather);

    const directions = googleMapsUrl(game.mapsQuery);
    if (directions) {
      const link = document.createElement("a");
      link.className = "calendar-directions";
      link.href = directions;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Directions";
      side.append(link);
    }

    article.append(main, side);
    els.calendarDetail.append(article);
  }
}

function renderCalendar(calendar) {
  currentCalendar = calendar || null;
  els.calendarGrid.replaceChildren();

  if (!calendar?.startDate) {
    els.calendarDetail.textContent = "Calendar unavailable.";
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

    button.addEventListener("click", () => renderCalendarDetail(date));
    els.calendarGrid.append(button);
  }

  renderCalendarDetail(selectedCalendarDate);
  renderNextGame((calendar.games || [])[0] || null);
}

async function loadCalendar() {
  try {
    const payload = await api("/web/calendar");
    renderCalendar(payload.calendar || null);
  } catch (error) {
    currentCalendar = null;
    els.calendarGrid.replaceChildren();
    els.calendarDetail.textContent = error.message;
    els.calendarUpdated.textContent = "Calendar offline";
    await loadNextGame();
  }
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
        title: "BallerWatch next game",
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
  els.bellPushStatus.textContent = status;
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
    els.bellPushStatus.textContent = error.message;
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

function clearAnswerHold() {
  if (answerHoldTimer) clearTimeout(answerHoldTimer);
  answerHoldTimer = null;
  answerHoldStart = null;
}

async function reportWrongAnswer() {
  clearAnswerHold();
  if (!lastAnswerExchange || feedbackSubmitted) return;

  if (!ownerToken()) {
    els.answerFeedbackStatus.hidden = false;
    els.answerFeedbackStatus.textContent =
      "Pair this device in Settings to send answer feedback.";
    await openSettings();
    return;
  }

  feedbackSubmitted = true;
  els.answer.classList.add("answer-feedback-pending");
  els.answerFeedbackStatus.hidden = false;
  els.answerFeedbackStatus.textContent = "Sending feedback…";
  try {
    await api("/web/feedback", {
      method: "POST",
      headers: ownerHeaders(),
      body: JSON.stringify(lastAnswerExchange),
    });
    els.answer.classList.remove("answer-feedback-pending");
    els.answer.classList.add("answer-feedback-sent");
    els.answerFeedbackStatus.textContent =
      "Marked wrong — queued for the next review.";
  } catch (error) {
    feedbackSubmitted = false;
    els.answer.classList.remove("answer-feedback-pending");
    if (error.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      els.answerFeedbackStatus.textContent =
        "Pair this device again to send answer feedback.";
      await openSettings();
    } else {
      els.answerFeedbackStatus.textContent = error.message;
    }
  }
}

function startAnswerHold(event) {
  if (!lastAnswerExchange || feedbackSubmitted) return;
  clearAnswerHold();
  answerHoldStart = { x: event.clientX, y: event.clientY };
  answerHoldTimer = setTimeout(() => {
    void reportWrongAnswer();
  }, 700);
}

function moveAnswerHold(event) {
  if (!answerHoldTimer || !answerHoldStart) return;
  const dx = Math.abs(event.clientX - answerHoldStart.x);
  const dy = Math.abs(event.clientY - answerHoldStart.y);
  if (dx > 12 || dy > 12) clearAnswerHold();
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
    els.answer.classList.remove("answer-feedback-pending", "answer-feedback-sent");
    els.answerFeedbackStatus.hidden = false;
    els.answerFeedbackStatus.textContent = "Hold the answer to mark it wrong for the next review.";
    if (payload.lastDate) sessionStorage.setItem("ballerwatch-last-date", payload.lastDate);
  } catch (error) {
    lastAnswerExchange = null;
    feedbackSubmitted = false;
    els.answerFeedbackStatus.hidden = true;
    els.answer.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

els.answer.addEventListener("pointerdown", startAnswerHold);
els.answer.addEventListener("pointermove", moveAnswerHold);
els.answer.addEventListener("pointerup", clearAnswerHold);
els.answer.addEventListener("pointercancel", clearAnswerHold);
els.answer.addEventListener("pointerleave", clearAnswerHold);
els.answer.addEventListener("contextmenu", (event) => {
  if (lastAnswerExchange) event.preventDefault();
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

window.addEventListener("online", () => { els.system.textContent = "Live"; });
window.addEventListener("offline", () => { els.system.textContent = "Offline"; });

applyInstallState();
await registerServiceWorker().catch(() => null);
await Promise.all([loadConfig(), loadBoard(), loadCalendar()]);
await updatePushStatus();

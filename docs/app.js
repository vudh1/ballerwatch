const API = "https://ballerwatch-telegram.vudhone.workers.dev";

const els = {
  system: document.querySelector("#system-status"),
  version: document.querySelector("#version"),
  board: document.querySelector("#board"),
  refresh: document.querySelector("#refresh-board"),
  notificationBell: document.querySelector("#notification-bell"),
  notificationBadge: document.querySelector("#notification-badge"),
  notificationDialog: document.querySelector("#notification-dialog"),
  closeNotifications: document.querySelector("#close-notifications"),
  bellPushToggle: document.querySelector("#bell-push-toggle"),
  bellPushStatus: document.querySelector("#bell-push-status"),
  form: document.querySelector("#question-form"),
  question: document.querySelector("#question"),
  answer: document.querySelector("#answer"),
  enablePush: document.querySelector("#enable-push"),
  disablePush: document.querySelector("#disable-push"),
  pushStatus: document.querySelector("#push-status"),
  pushHint: document.querySelector("#push-hint"),
  installCard: document.querySelector("#install-card"),
  installHelp: document.querySelector("#install-help"),
  installDialog: document.querySelector("#install-dialog"),
  nextGameCard: document.querySelector("#next-game-card"),
  nextGameTitle: document.querySelector("#next-game-title"),
  nextGameType: document.querySelector("#next-game-type"),
  nextGameMeta: document.querySelector("#next-game-meta"),
  nextGameLocation: document.querySelector("#next-game-location"),
  nextGameActions: document.querySelector("#next-game-actions"),
  nextGameDirections: document.querySelector("#next-game-directions"),
  nextGameShare: document.querySelector("#next-game-share"),
  nextGameHint: document.querySelector("#next-game-hint"),
  testNotification: document.querySelector("#test-notification"),
  testNotificationStatus: document.querySelector("#test-notification-status"),
};

let config = null;
let currentNextGame = null;

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
    throw new Error(payload.error || `Request failed (HTTP ${response.status})`);
  }
  return payload;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const registration = await navigator.serviceWorker.register("./sw.js?v=3.2.0", {
    scope: "./",
    updateViaCache: "none",
  });
  await registration.update().catch(() => null);
  return registration;
}

async function loadConfig() {
  try {
    config = await api("/web/config");
    els.system.textContent = "Online";
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

function renderNextGame(game) {
  currentNextGame = game || null;

  if (!game) {
    els.nextGameTitle.textContent = "No upcoming game";
    els.nextGameType.textContent = "None";
    els.nextGameMeta.textContent = "No pickup or RATS game is currently published.";
    els.nextGameLocation.textContent = "";
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
    els.testNotificationStatus.textContent =
      "Scheduled — close BallerWatch now. The test alert should appear in about 5 seconds.";
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

function setPushUi({ status, hint, enabled, toggleDisabled = false, color = "" }) {
  els.pushStatus.textContent = status;
  els.pushStatus.style.color = color;
  els.pushHint.textContent = hint;
  els.bellPushStatus.textContent = status;
  els.bellPushToggle.checked = enabled;
  els.bellPushToggle.disabled = toggleDisabled;
}

async function updatePushStatus() {
  if (!("Notification" in window) || !("PushManager" in window)) {
    setPushUi({
      status: "Unsupported",
      hint: "This browser does not expose Web Push.",
      enabled: false,
      toggleDisabled: true,
    });
    return;
  }

  let subscription = await currentSubscription().catch(() => null);
  if (subscription && config?.push?.applicationServerKey && !subscriptionMatchesConfig(subscription)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
    els.pushHint.textContent = "Push identity was reset. Tap Enable push to subscribe again.";
  }

  if (subscription) {
    setPushUi({
      status: "On",
      hint: "Backup push is active on this device.",
      enabled: true,
      color: "#86efac",
    });
  } else if (Notification.permission === "denied") {
    setPushUi({
      status: "Blocked",
      hint: "Notifications are blocked in device settings.",
      enabled: false,
      toggleDisabled: true,
    });
  } else {
    setPushUi({
      status: "Off",
      hint: ios() && !standalone()
        ? "On iPhone, add BallerWatch to the Home Screen before enabling push."
        : "Tap Enable push to subscribe this device.",
      enabled: false,
    });
  }
}

async function enablePush() {
  els.enablePush.disabled = true;
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
    els.pushHint.textContent = "Subscription saved. Push delivery will activate after runtime-state sync.";
  } catch (error) {
    els.pushHint.textContent = error.message;
  } finally {
    els.enablePush.disabled = false;
    await updatePushStatus();
  }
}

async function disablePush() {
  els.disablePush.disabled = true;
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await api("/web/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    }).catch(() => null);
    await subscription.unsubscribe();
    els.pushHint.textContent = "Push disabled on this device.";
  } finally {
    els.disablePush.disabled = false;
    await updatePushStatus();
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = els.question.value.trim();
  if (!question) return;
  const button = els.form.querySelector("button");
  button.disabled = true;
  els.answer.hidden = false;
  els.answer.textContent = "Thinking…";
  try {
    const payload = await api("/web/ask", {
      method: "POST",
      body: JSON.stringify({
        question,
        context: { lastDate: sessionStorage.getItem("ballerwatch-last-date") || "" },
      }),
    });
    els.answer.textContent = payload.reply;
    if (payload.lastDate) sessionStorage.setItem("ballerwatch-last-date", payload.lastDate);
  } catch (error) {
    els.answer.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

els.notificationBell.addEventListener("click", openNotifications);
els.nextGameShare.addEventListener("click", shareNextGame);
els.testNotification.addEventListener("click", scheduleTestNotification);
els.closeNotifications.addEventListener("click", () => els.notificationDialog.close());
els.refresh.addEventListener("click", loadBoard);
els.enablePush.addEventListener("click", enablePush);
els.disablePush.addEventListener("click", disablePush);
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

window.addEventListener("online", () => { els.system.textContent = "Online"; });
window.addEventListener("offline", () => { els.system.textContent = "Offline"; });

applyInstallState();
await registerServiceWorker().catch(() => null);
await Promise.all([loadConfig(), loadBoard(), loadNextGame()]);
await updatePushStatus();

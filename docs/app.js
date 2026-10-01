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
};

let config = null;

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
  return navigator.serviceWorker.register("./sw.js", { scope: "./" });
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

async function updatePushStatus() {
  if (!("Notification" in window) || !("PushManager" in window)) {
    els.pushStatus.textContent = "Unsupported";
    els.pushHint.textContent = "This browser does not expose Web Push.";
    return;
  }

  let subscription = await currentSubscription().catch(() => null);
  if (subscription && config?.push?.applicationServerKey && !subscriptionMatchesConfig(subscription)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
    els.pushHint.textContent = "Push identity was reset. Tap Enable push to subscribe again.";
  }

  if (subscription) {
    els.pushStatus.textContent = "Enabled";
    els.pushStatus.style.color = "#86efac";
    els.pushHint.textContent = "Backup push is active on this device.";
  } else if (Notification.permission === "denied") {
    els.pushStatus.textContent = "Blocked";
    els.pushHint.textContent = "Notifications are blocked in device settings.";
  } else {
    els.pushStatus.textContent = "Off";
    els.pushHint.textContent =
      ios() && !standalone()
        ? "On iPhone, add BallerWatch to the Home Screen before enabling push."
        : "Tap Enable push to subscribe this device.";
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
els.closeNotifications.addEventListener("click", () => els.notificationDialog.close());
els.refresh.addEventListener("click", loadBoard);
els.enablePush.addEventListener("click", enablePush);
els.disablePush.addEventListener("click", disablePush);
els.installHelp?.addEventListener("click", () => els.installDialog.showModal());

window.addEventListener("online", () => { els.system.textContent = "Online"; });
window.addEventListener("offline", () => { els.system.textContent = "Offline"; });

applyInstallState();
await registerServiceWorker().catch(() => null);
await Promise.all([loadConfig(), loadBoard()]);
await updatePushStatus();

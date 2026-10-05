const CACHE = "ballerwatch-v7-0-4-shell";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=7.0.4",
  "./app.js?v=7.0.4",
  "./lib/client.js",
  "./lib/notification-state.js",
  "./manifest.webmanifest?v=7.0.4",
  "./icon.svg?v=7.0.4",
];
const API = "https://ballerwatch-web.vudhone.workers.dev";
const APP_URL = "https://vudh1.github.io/ballerwatch/";
const DEVICE_STATE_CACHE = "ballerwatch-device-state-v1";
const BADGE_STATE_URL = new URL("./.badge-state", self.location.href).href;
const NOTIFICATION_PREFS_URL = new URL("./.notification-prefs", self.location.href).href;

function normalizedBadgeCount(value) {
  return Math.min(999, Math.max(0, Math.floor(Number(value) || 0)));
}

async function readBadgeCount() {
  try {
    const cache = await caches.open(DEVICE_STATE_CACHE);
    const response = await cache.match(BADGE_STATE_URL);
    if (!response) return 0;
    const payload = await response.json();
    return normalizedBadgeCount(payload?.count);
  } catch {
    return 0;
  }
}

async function writeBadgeCount(count) {
  const normalized = normalizedBadgeCount(count);
  try {
    const cache = await caches.open(DEVICE_STATE_CACHE);
    await cache.put(
      BADGE_STATE_URL,
      new Response(JSON.stringify({ count: normalized }), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {}
  return normalized;
}

async function applyAppBadge(count) {
  const normalized = normalizedBadgeCount(count);
  try {
    if (normalized > 0 && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(normalized);
    } else if ("clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch {}
  return normalized;
}

async function syncBadgeCount(count) {
  const normalized = await writeBadgeCount(count);
  await applyAppBadge(normalized);
  return normalized;
}

async function incrementAppBadge() {
  const current = await readBadgeCount();
  return syncBadgeCount(current + 1);
}

function normalizedChannels(value) {
  return {
    pickup: value?.pickup !== false,
    league: value?.league !== false,
    version: value?.version !== false,
  };
}

async function readNotificationChannels() {
  try {
    const cache = await caches.open(DEVICE_STATE_CACHE);
    const response = await cache.match(NOTIFICATION_PREFS_URL);
    if (!response) return normalizedChannels();
    return normalizedChannels(await response.json());
  } catch {
    return normalizedChannels();
  }
}

async function writeNotificationChannels(channels) {
  const normalized = normalizedChannels(channels);
  try {
    const cache = await caches.open(DEVICE_STATE_CACHE);
    await cache.put(
      NOTIFICATION_PREFS_URL,
      new Response(JSON.stringify(normalized), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {}
  return normalized;
}

function safeAppUrl(value) {
  try {
    const url = new URL(String(value || APP_URL), APP_URL);
    if (url.origin !== new URL(APP_URL).origin) return APP_URL;
    if (!url.pathname.startsWith("/ballerwatch/")) return APP_URL;
    return url.href;
  } catch {
    return APP_URL;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE && key !== DEVICE_STATE_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const networkRequest = new Request(event.request, { cache: "no-store" });

  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ballerwatch:badge-count") {
    event.waitUntil(syncBadgeCount(event.data?.count));
    return;
  }
  if (event.data?.type === "ballerwatch:notification-preferences") {
    event.waitUntil(writeNotificationChannels(event.data?.channels));
    return;
  }
  if (event.data?.type !== "ballerwatch:test-notification") return;
  const requestedDelay = Number(event.data?.delayMs);
  const delayMs = Number.isFinite(requestedDelay)
    ? Math.min(10_000, Math.max(0, requestedDelay))
    : 5_000;

  event.waitUntil(new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await self.registration.showNotification("BallerWatch", {
          body: "Test notification.",
          icon: "./icon.svg",
          badge: "./icon.svg",
          tag: "ballerwatch-local-test",
          data: { url: "https://vudh1.github.io/ballerwatch/" },
        });
      } finally {
        resolve();
      }
    }, delayMs);
  }));
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let entry = null;
    try {
      const [response, channels] = await Promise.all([
        fetch(API + "/web/board?limit=30", { cache: "no-store" }),
        readNotificationChannels(),
      ]);
      const payload = await response.json();
      entry = (payload?.entries || []).find((item) => {
        const channel = String(item?.channel || "");
        return !channel || channels[channel] !== false;
      }) || null;
    } catch {}

    if (!entry) return;
    const title = entry.title || "BallerWatch updated";
    const options = {
      body: entry.body || "Open BallerWatch for the latest soccer update.",
      icon: "./icon.svg",
      badge: "./icon.svg",
      tag: entry.tag || "ballerwatch-update",
      renotify: true,
      data: { url: safeAppUrl(entry.url) },
    };
    await Promise.all([
      incrementAppBadge(),
      self.registration.showNotification(title, options),
    ]);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = safeAppUrl(event.notification.data?.url);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(APP_URL));
    if (existing) {
      await existing.focus();
      existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

/**
 * Shared V1/V2 offline and push lifecycle. Baseline: v8.10.0.
 * Each registration owns only its route-specific shell/device caches. Never
 * intercept remote APIs or persist authenticated responses in frontend caches.
 */
const IS_V2 = /\/v2\/sw\.js$/.test(self.location.pathname);
const CACHE = IS_V2 ? "ballerwatch-v2-v8-11-0-shell" : "ballerwatch-v8-11-0-shell";
const SHELL = IS_V2 ? [
  "./",
  "./index.html",
  "./prepaint.js?v=8.11.0",
  "./styles.css?v=8.11.0",
  "./app.js?v=8.11.0",
  "./timeline.js",
  "./scene-config.mjs",
  "./assets/stadium.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./manifest.webmanifest?v=8.11.0",
  "../styles.css?v=8.11.0",
  "../app.js?v=8.11.0",
  "../lib/client.js",
  "../lib/experience.js",
  "../lib/public-calendar-cache.js",
  "../lib/settings-choice.js",
  "../lib/notification-state.js",
  "../icon.svg?v=8.11.0",
  "../apple-touch-icon.png?v=8.11.0",
] : [
  "./",
  "./index.html",
  "./launch-prepaint.js?v=8.11.0",
  "./styles.css?v=8.11.0",
  "./app.js?v=8.11.0",
  "./lib/client.js",
  "./lib/experience.js",
  "./lib/public-calendar-cache.js",
  "./lib/settings-choice.js",
  "./lib/notification-state.js",
  "./manifest.webmanifest?v=8.11.0",
  "./icon.svg?v=8.11.0",
  "./apple-touch-icon.png?v=8.11.0",
];
const API = "https://ballerwatch-web.vudhone.workers.dev";
const APP_URL = new URL("./", self.location.href).href;
const ICON_URL = new URL(IS_V2 ? "../icon.svg" : "./icon.svg", self.location.href).href;
const DEVICE_STATE_CACHE = IS_V2 ? "ballerwatch-v2-device-state-v1" : "ballerwatch-device-state-v1";
const BADGE_STATE_URL = new URL("./.badge-state", self.location.href).href;
const NOTIFICATION_PREFS_URL = new URL("./.notification-prefs", self.location.href).href;
const RSVP_STATE_URL = new URL("./.rsvp-state", self.location.href).href;

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

function cleanRsvpDates(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item))))].slice(0, 300);
}

async function writeRsvpState(state) {
  const value = {
    confirmedDates: cleanRsvpDates(state?.confirmedDates),
    waitlistedDates: cleanRsvpDates(state?.waitlistedDates),
  };
  try {
    const cache = await caches.open(DEVICE_STATE_CACHE);
    await cache.put(
      RSVP_STATE_URL,
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {}
}

async function readRsvpState() {
  try {
    const cache = await caches.open(DEVICE_STATE_CACHE);
    const response = await cache.match(RSVP_STATE_URL);
    return response ? await response.json() : {};
  } catch {
    return {};
  }
}

function skipBookedRsvpAlert(entry, state) {
  const tag = String(entry?.tag || "");
  const reminder = tag.match(/^pickup-rsvp-reminder-(\d{4}-\d{2}-\d{2})$/);
  const capacity = tag.match(/^pickup-capacity-(\d{4}-\d{2}-\d{2})-\d+$/);
  if (!reminder && !capacity) return false;
  const date = (reminder || capacity)[1];
  return (state?.confirmedDates || []).includes(date) ||
    Boolean(reminder && (state?.waitlistedDates || []).includes(date));
}

function safeAppUrl(value) {
  try {
    const url = new URL(String(value || APP_URL), APP_URL);
    if (url.origin !== new URL(APP_URL).origin) return APP_URL;
    if (!url.pathname.startsWith("/ballerwatch/")) return APP_URL;
    // Board links describe the shared product. Keep each installed app inside
    // its own launch identity when the board supplies the original root URL.
    if (IS_V2 && !url.pathname.startsWith(new URL(APP_URL).pathname)) {
      const destination = new URL(APP_URL);
      destination.search = url.search;
      destination.hash = url.hash;
      return destination.href;
    }
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
          .filter((key) => key !== CACHE && key.endsWith("-shell") &&
            (IS_V2 ? key.startsWith("ballerwatch-v2-") :
              /^ballerwatch-v\d/.test(key) && !key.startsWith("ballerwatch-v2-")))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // A navigation controlled by the parent V1 worker must never receive the
  // root document as a V2 offline fallback before the narrower scope claims it.
  const inRoute = IS_V2 || !/\/v2(?:\/|$)/.test(url.pathname);
  if (event.request.mode === "navigate" && !inRoute) return;

  const networkRequest = new Request(event.request, { cache: "no-store" });

  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        if (response.ok && response.type !== "opaque") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const fallback = await cache.match(new URL("./index.html", self.location.href).href);
          if (fallback) return fallback;
        }
        return Response.error();
      }),
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
  if (event.data?.type === "ballerwatch:rsvp-state") {
    event.waitUntil(writeRsvpState(event.data));
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
          icon: ICON_URL,
          badge: ICON_URL,
          tag: "ballerwatch-local-test",
          data: { url: APP_URL },
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
      const [response, channels, rsvpState] = await Promise.all([
        fetch(API + "/web/board?limit=30", { cache: "no-store" }),
        readNotificationChannels(),
        readRsvpState(),
      ]);
      const payload = await response.json();
      // A suppressed new alert must not replay an older notification.
      const candidate = Array.isArray(payload?.entries) ? payload.entries[0] : null;
      const channel = String(candidate?.channel || "");
      entry = candidate && (!channel || channels[channel] !== false) &&
        !skipBookedRsvpAlert(candidate, rsvpState) ? candidate : null;
    } catch {}

    if (!entry) return;
    const title = entry.title || "BallerWatch updated";
    const options = {
      body: entry.body || "Open BallerWatch for the latest soccer update.",
      icon: ICON_URL,
      badge: ICON_URL,
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
    const existing = windows.find((client) => client.url.startsWith(APP_URL) &&
      (IS_V2 || !/\/v2(?:\/|$)/.test(new URL(client.url).pathname)));
    if (existing) {
      await existing.focus();
      existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

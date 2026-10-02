const CACHE = "ballerwatch-v5-3-3-shell";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=5.3.3",
  "./app.js?v=5.3.3",
  "./manifest.webmanifest",
  "./icon.svg",
];
const API = "https://ballerwatch-telegram.vudhone.workers.dev";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
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
      const response = await fetch(API + "/web/board?limit=1", { cache: "no-store" });
      const payload = await response.json();
      entry = payload?.entries?.[0] || null;
    } catch {}

    const title = entry?.title || "BallerWatch updated";
    const options = {
      body: entry?.body || "Open BallerWatch for the latest soccer update.",
      icon: "./icon.svg",
      badge: "./icon.svg",
      tag: entry?.tag || "ballerwatch-update",
      renotify: true,
      data: { url: entry?.url || "https://vudh1.github.io/ballerwatch/" },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = event.notification.data?.url || "https://vudh1.github.io/ballerwatch/";
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith("https://vudh1.github.io/ballerwatch/"));
    if (existing) {
      await existing.focus();
      existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

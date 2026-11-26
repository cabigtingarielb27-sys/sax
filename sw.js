const SHELL = "padalapay-shell-v1";
const ASSET = "padalapay-assets-v1";
const SYNC_TAG = "padalapay-sync";
const APP_URL = "https://padalapay.base44.app";

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.add(APP_URL).catch(() => {});
      await cache.add("index.html").catch(() => {});
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== ASSET).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Navigations: network-first, fall back to cached app shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put(APP_URL, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(APP_URL)) || (await cache.match("index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(ASSET);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((fresh) => { cache.put(req, fresh.clone()).catch(() => {}); return fresh; })
          .catch(() => null);
        return cached || (await network) || Response.error();
      })()
    );
  }
});

// Auto-sync: when connectivity returns and the Background Sync tag fires, tell
// every open client to replay its offline pending-action queue.
self.addEventListener("sync", (e) => {
  if (e.tag === SYNC_TAG) {
    e.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of clients) c.postMessage({ type: "padalapay-auto-sync" });
      })()
    );
  }
});

// Also trigger sync on push / wakeup so queued actions replay promptly.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "padalapay-auto-sync") {
    self.registration.sync.register(SYNC_TAG).catch(() => {});
  }
});

/* Fed & Watered — service worker
   Cache name is date-stamped, so this deploy replaces every older cache. */

const CACHE = "fed-and-watered-2026-10-28b";

// Best-effort app shell. Anything that 404s is skipped rather than
// failing the whole install, so unknown icon names can't break it.
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API calls (the cookbook scanner).
  if (url.hostname.endsWith("api.anthropic.com")) return;

  const isAppCode =
    req.mode === "navigate" ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.json");

  if (isAppCode) {
    // Network first: you get the new version as soon as you're online,
    // and the cached copy keeps the app working when you're not.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const hit = await caches.match(req);
          return hit || caches.match("./index.html");
        }
      })()
    );
    return;
  }

  // Everything else (fonts, icons): cache first, refill in the background.
  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) {
        fetch(req)
          .then((res) => caches.open(CACHE).then((c) => c.put(req, res)))
          .catch(() => {});
        return hit;
      }
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })()
  );
});

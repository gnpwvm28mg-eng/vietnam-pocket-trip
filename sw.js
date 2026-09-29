const CACHE = "vietnam-pocket-v6-month";
const CACHE_PREFIX = "vietnam-pocket-";
const CORE = ["./", "./index.html", "./style.css?v=month-6", "./app.js?v=month-6", "./data.js?v=month-6", "./search.js?v=month-6", "./standalone.js?v=month-6", "./manifest.json", "./icon-192.png", "./icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE.map((url) => new Request(url, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
          await cache.put("./index.html", response.clone());
          return response;
        }
        return (await cache.match("./index.html")) || response;
      } catch (_) {
        return (await cache.match("./index.html")) || Response.error();
      }
    }
    // Match versioned assets exactly so a new page never receives an old script.
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (_) {
      // Only navigations may fall back to HTML; scripts and images must fail cleanly.
      return Response.error();
    }
  })());
});

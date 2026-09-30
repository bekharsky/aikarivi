const CACHE_NAME = "aikarivi-web-shell-9e528bb2043e";
const SHELL = ["./","./index.html","./manifest.webmanifest","../favicon.ico?v=timeline-2","../favicon-16.png?v=timeline-2","../favicon-32.png?v=timeline-2","../favicon.svg?v=timeline-2","./assets/index-Dwsq-Kj6.js","./assets/index-VTW4Tnc4.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("aikarivi-web-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("./", response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request))
          || (await caches.match("./index.html"))
          || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && new URL(request.url).pathname.startsWith(new URL(self.registration.scope).pathname)) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
    }),
  );
});

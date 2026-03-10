const CACHE_NAME = "charts-shell-v2";

function getBasePath() {
  const scopeUrl = new URL(self.registration.scope);
  return scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
}

self.addEventListener("install", (event) => {
  const basePath = getBasePath();
  const appShell = [basePath, `${basePath}index.html`, `${basePath}manifest.json`];
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(appShell)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const basePath = getBasePath();

  if (request.mode === "navigate" && url.pathname.startsWith(basePath)) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match(`${basePath}index.html`)) ||
          (await cache.match(basePath))
        );
      }),
    );
    return;
  }

  if (url.pathname.startsWith(basePath) || url.pathname.startsWith(`${basePath}assets/`) || basePath === "/") {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse.ok) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }),
    );
  }
});

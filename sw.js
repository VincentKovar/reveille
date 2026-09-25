/* Minimal service worker: caches static assets so the app shell loads
 * instantly and works offline. It does NOT enable background alarm
 * firing — see the README for why that isn't possible in a static
 * web app, and the supported "keep the app open" usage pattern. */
const CACHE_NAME = "reveille-v1";
const ASSETS_TO_CACHE = [
    "./",
    "./index.html",
    "./manifest.json",
    "./js/config.js",
    "./js/storage.js",
    "./js/poems.js",
    "./js/gemini.js",
    "./js/app.js",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return (
                cached ||
                fetch(event.request).catch(() => cached)
            );
        })
    );
});

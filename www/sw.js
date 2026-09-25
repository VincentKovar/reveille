/* Caches the app so it opens instantly and works offline — important for an
 * alarm clock whose Wi-Fi might be down at 6 a.m. It does NOT let the web
 * version ring in the background; see the README for why.
 * Changes reach phones on the launch after next; bump CACHE_NAME to force a clean refresh. */
const CACHE_NAME = "reveille-v2.0.0";
const APP_FILES = [
    "./", "./index.html", "./manifest.json", "./css/app.css",
    "./fonts/cormorant-garamond.woff2", "./fonts/cormorant-garamond-italic.woff2", "./fonts/plus-jakarta-sans.woff2",
    "./icons/icon-192.png", "./icons/apple-touch-icon.png",
    "./js/app.js", "./js/config.js", "./js/gemini.js", "./js/platform.js", "./js/poems.js",
    "./js/schedule.js", "./js/setup.js", "./js/sound.js", "./js/storage.js",
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
    );
    self.clients.claim();
});

// App files: answer from the cache instantly, and refresh the cache in the
// background so the next launch gets any update. Gemini calls go straight to the network.
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreSearch: true });
        const fresh = fetch(event.request).then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
        }).catch(() => cached);
        return cached || fresh;
    }));
});

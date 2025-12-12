const CACHE_NAME = "nomadcloset-v3"; 
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./login.html",
  "./settings.html",
  "./style.css",
  "./app.js",
  "./settings.js",
  "./login.js",
  "./config.js",
  "./media/favicon.png"
];

// 1. Install Event: Cache files
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Force this SW to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Event: Clean up old caches (Essential for future updates)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Removing old cache", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. Fetch Event: Serve from Cache, fallback to Network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
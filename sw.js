self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open('voicebridge-v12').then((cache) => {
      return cache.addAll(['./index.html', './app.js?v=12', './manifest.json']);
    })
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== 'voicebridge-v12' && caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
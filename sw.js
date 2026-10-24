self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open('voicebridge-v8').then((cache) => {
      return cache.addAll(['./index.html', './app.js', './manifest.json']);
    })
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== 'voicebridge-v8' && caches.delete(k)))
    )
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
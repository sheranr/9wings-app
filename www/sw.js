// Offline support for the web version: keeps the app files on the phone.
const VERSION = '9wings-v1.0.0';
const FILES = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/db.js', 'js/logic.js', 'js/pdf.js', 'js/native.js', 'js/sync.js', 'pdf-lib.min.js', 'manifest.webmanifest', 'img/logo.jpg', 'img/floral.jpg', 'img/icon-192.png', 'img/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates arrive), cache when offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list[0] ? list[0].focus() : self.clients.openWindow('./index.html#/home')));
});

// Offline support for the web version: keeps the app files on the phone.
const VERSION = '9wings-v2.1.0';
const FILES = ["./", "index.html", "css/styles.css", "pdf-lib.min.js", "manifest.webmanifest", "vendor/firebase.js", "js/app.js", "js/data-device.js", "js/data-firebase.js", "js/data.js", "js/firebase-config.js", "js/icons.js", "js/logic.js", "js/native.js", "js/pdf.js", "js/report.js", "js/xlsx.js", "js/state.js", "js/ui.js", "js/updates.js", "js/views/auth.js", "js/views/bookings.js", "js/views/calendar.js", "js/views/clients.js", "js/views/home.js", "js/views/invoices.js", "js/views/money.js", "js/views/reports.js", "js/views/services.js", "js/views/system.js", "fonts/inter-latin-400-normal.woff2", "fonts/inter-latin-500-normal.woff2", "fonts/inter-latin-600-normal.woff2", "fonts/playfair-display-latin-500-normal.woff2", "fonts/playfair-display-latin-600-normal.woff2", "fonts/playfair-display-latin-700-normal.woff2", "img/logo-full.webp", "img/logo-header.webp", "img/logo-pdf.png", "img/icon-192.png", "img/icon-512.png"];

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

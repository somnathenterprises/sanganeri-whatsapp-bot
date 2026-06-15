// Minimal service worker - enables "Add to Home Screen" installability.
// Network-first; no offline caching of dashboard data (data must be live).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

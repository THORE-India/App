// ===============================
// MINIMAL & ROOT-SAFE SERVICE WORKER
// ===============================

const CACHE_NAME = 'thore-static-v1';

// ONLY same-origin, guaranteed files
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js'
];

// Install – cache static files only
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate – clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// Fetch – ONLY serve cached static GET requests
self.addEventListener('fetch', event => {
  // Do not touch non-GET
  if (event.request.method !== 'GET') return;

  // Do not touch APIs or external domains
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

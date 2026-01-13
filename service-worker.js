// ===============================
// SAFE SERVICE WORKER (API-SAFE)
// ===============================

const CACHE_NAME = 'thore-portal-v2';

// Cache ONLY local static assets
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 🚫 DO NOT INTERCEPT API CALLS
  if (
    event.request.method !== 'GET' ||
    url.includes('script.google.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// Push notifications (unchanged)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/manifest.json',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('THORE India Portal', options)
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

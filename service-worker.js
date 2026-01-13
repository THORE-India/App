// =====================================
// THORE INDIA – PWA SERVICE WORKER v2
// Notifications + Offline Safe
// =====================================

const CACHE_NAME = 'thore-static-v2';

// Cache ONLY same-origin static assets
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
];

// -----------------------------
// INSTALL
// -----------------------------
self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
  );
});

// -----------------------------
// ACTIVATE
// -----------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// -----------------------------
// FETCH (SAFE MODE)
// -----------------------------
self.addEventListener('fetch', event => {
  // Only cache same-origin GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never touch external domains or APIs
  if (url.origin !== self.location.origin) return;

  // Navigation fallback (offline support)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static asset caching
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// =================================================
// 🔔 NOTIFICATIONS (ANDROID / SYSTEM LEVEL)
// =================================================

// Receive messages FROM main app
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, count } = event.data.payload;

    self.registration.showNotification(title || 'THORE India Portal', {
      body: body || 'You have a new notification',
      icon: './android-icon-192x192.png',
      badge: './android-icon-192x192.png',
      tag: 'thore-notification', // prevents spam
      renotify: true,
      vibrate: [100, 50, 100],
      data: {
        url: './'
      }
    });
  }
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            return client.focus();
          }
        }
        return self.clients.openWindow('./');
      })
  );
});

// =====================================
// THORE INDIA – PWA SERVICE WORKER v5
// FCM + Offline — Mobile Doze-safe
// =====================================

// Cache Firebase libs during install so they work in Doze/sleep mode
var FIREBASE_APP_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
var FIREBASE_MSG_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js';
var CACHE_NAME = 'thore-static-v5';
var FIREBASE_CACHE = 'thore-firebase-libs-v1';

var STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

// ── INSTALL: cache everything including Firebase libs ──────────────────────
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      // Cache app assets
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache Firebase SDK libs separately so importScripts works offline
      caches.open(FIREBASE_CACHE).then(function(cache) {
        return cache.addAll([FIREBASE_APP_URL, FIREBASE_MSG_URL]);
      })
    ])
  );
});

// ── ACTIVATE: clean old caches ─────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== CACHE_NAME && key !== FIREBASE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: serve Firebase libs from cache (critical for Doze mode) ─────────
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Serve Firebase libs from cache — never fail on network in sleep mode
  if (url === FIREBASE_APP_URL || url === FIREBASE_MSG_URL) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(FIREBASE_CACHE).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  if (event.request.method !== 'GET') return;

  var reqUrl = new URL(url);
  if (reqUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});

// ── Firebase init (after fetch handler so cache intercepts importScripts) ──
try {
  importScripts(FIREBASE_APP_URL);
  importScripts(FIREBASE_MSG_URL);

  firebase.initializeApp({
    apiKey: "AIzaSyBulJJEZhgiCM0lsmwtH58VQwbzOkRC7Co",
    authDomain: "thore-india.firebaseapp.com",
    projectId: "thore-india",
    storageBucket: "thore-india.firebasestorage.app",
    messagingSenderId: "104117516859",
    appId: "1:104117516859:web:75b9174f691635174afa1e"
  });

  var messaging = firebase.messaging();

  // ── BACKGROUND PUSH HANDLER ────────────────────────────────────────────
  messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] FCM background message received:', payload);

    var notifTitle = (payload.notification && payload.notification.title) || 'THORE India Portal';
    var notifBody  = (payload.notification && payload.notification.body)  || 'You have a new notification';
    var notifData  = payload.data || {};

    return self.registration.showNotification(notifTitle, {
      body: notifBody,
      icon: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png',
      badge: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png',
      tag: 'thore-' + (notifData.requestId || Date.now()),
      renotify: true,
      vibrate: [200, 100, 200],
      data: notifData
    });
  });

} catch (e) {
  console.error('[SW] Firebase init failed:', e);
  // SW continues running — PWA caching still works even if FCM failed
}

// ── NOTIFICATION CLICK ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url)
    || 'https://thore-india.github.io/App/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url.includes('thore-india.github.io') && 'focus' in c) {
          return c.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ── PUSH SUBSCRIPTION CHANGE (handles token refresh on mobile) ────────────
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW] Push subscription changed — token refresh needed');
  // Notify all open clients to re-register their FCM token
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      clientList.forEach(function(c) {
        c.postMessage({ type: 'FCM_TOKEN_REFRESH' });
      });
    })
  );
});

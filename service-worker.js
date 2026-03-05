// =====================================
// THORE INDIA – PWA SERVICE WORKER v4
// FCM + Offline (MERGED - no separate firebase-messaging-sw.js needed)
// =====================================

// Firebase imports MUST be first
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ⚠️ REPLACE WITH YOUR FIREBASE VALUES (same as index.html)
firebase.initializeApp({
  apiKey: "AIzaSyBulJJEZhgiCM0lsmwtH58VQwbzOkRC7Co",
  authDomain: "thore-india.firebaseapp.com",
  projectId: "thore-india",
  storageBucket: "thore-india.firebasestorage.app",
  messagingSenderId: "104117516859",
  appId: "1:104117516859:web:75b9174f691635174afa1e"
});

var messaging = firebase.messaging();

// =============================================
// FCM BACKGROUND MESSAGE HANDLER
// Fires when push arrives and app is closed
// =============================================
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] FCM background message:', payload);

  var title = (payload.notification && payload.notification.title) || 'THORE India Portal';
  var body = (payload.notification && payload.notification.body) || 'You have a new notification';

  self.registration.showNotification(title, {
    body: body,
    icon: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png',
    badge: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png',
    tag: 'thore-notification',
    renotify: true,
    vibrate: [100, 50, 100]
  });
});

// =============================================
// PWA CACHING
// =============================================
var CACHE_NAME = 'thore-static-v4';

var STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

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

// =============================================
// NOTIFICATION CLICK
// =============================================
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url.includes('thore-india.github.io') && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      return clients.openWindow('https://thore-india.github.io/App/');
    })
  );
});

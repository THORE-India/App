// ============================================
// FIREBASE MESSAGING SERVICE WORKER
// ⚠️ THIS FILE MUST BE AT YOUR ROOT URL
// e.g. https://yourdomain.com/App/firebase-messaging-sw.js
//
// This file is automatically used by Firebase to
// deliver push notifications when the app is in
// background or completely closed.
// ============================================

// ⚠️ REPLACE THESE 2 VALUES with your Firebase project values
// Get from: Firebase Console → Project Settings → General → Your apps

const FIREBASE_MESSAGING_SENDER_ID = "104117516859";
const FIREBASE_APP_ID = "1:104117516859:web:6738cfce20b0f7744afa1e";
const FIREBASE_API_KEY = "AIzaSyAdKhLRkYF8f7OSQ0PHG3HsOcKiDTmSicA";
const FIREBASE_PROJECT_ID = "thore-india";

// Import Firebase scripts (required for background handling)
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyAdKhLRkYF8f7OSQ0PHG3HsOcKiDTmSicA",
  authDomain: "thore-india.firebaseapp.com",
  projectId: "thore-india",
  storageBucket: "thore-india.firebasestorage.app",
  messagingSenderId: "104117516859",
  appId: "1:104117516859:web:6738cfce20b0f7744afa1e"
});

// Get messaging instance
const messaging = firebase.messaging();

// ============================================
// BACKGROUND MESSAGE HANDLER
// This fires when a push arrives and the app
// is in background or closed on mobile
// ============================================
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM SW] Background message received:', payload);

  const title = payload.notification?.title || 'THORE India Portal';
  const body = payload.notification?.body || 'You have a new notification';

  const notificationOptions = {
    body: body,
    icon: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png',
    badge: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png',
    tag: 'thore-fcm-notification',   // prevents duplicate notifications
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: payload.data?.url || './'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  self.registration.showNotification(title, notificationOptions);
});

// ============================================
// NOTIFICATION CLICK HANDLER
// Opens the app when user taps the notification
// ============================================
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

/* Firebase Cloud Messaging Service Worker */
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCHm6muuT7KPQ5G4_gY6Zeg5hX9JgK2it8",
  authDomain: "personal-life-os-68631.firebaseapp.com",
  projectId: "personal-life-os-68631",
  storageBucket: "personal-life-os-68631.firebasestorage.app",
  messagingSenderId: "311035303046",
  appId: "1:311035303046:web:79d34adee66c41b232ed07",
  measurementId: "G-LL97E8BWRJ"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Personal Life OS — สมองของคุณ';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'มีการแจ้งเตือนความจำใหม่ในระบบของคุณ',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});

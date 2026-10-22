import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  Firestore,
} from 'firebase/firestore';
import { getMessaging, isSupported as isMessagingSupported, type Messaging } from 'firebase/messaging';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: "AIzaSyCHm6muuT7KPQ5G4_gY6Zeg5hX9JgK2it8",
  authDomain: "personal-life-os-68631.firebaseapp.com",
  projectId: "personal-life-os-68631",
  storageBucket: "personal-life-os-68631.firebasestorage.app",
  messagingSenderId: "311035303046",
  appId: "1:311035303046:web:79d34adee66c41b232ed07",
  measurementId: "G-LL97E8BWRJ"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;

let messagingInstance: Messaging | null = null;
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const supported = await isMessagingSupported();
      if (supported) {
        messagingInstance = getMessaging(app);
      }
    } catch (err) {
      console.warn('Firebase Messaging is not supported in this environment:', err);
    }
  }
  return messagingInstance;
}

let analyticsInstance: Analytics | null = null;
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (typeof window !== 'undefined') {
    try {
      const supported = await isAnalyticsSupported();
      if (supported) {
        analyticsInstance = getAnalytics(app);
      }
    } catch (err) {
      console.warn('Firebase Analytics is not supported in this environment:', err);
    }
  }
  return analyticsInstance;
}

// Auto-initialize analytics if supported in browser
if (typeof window !== 'undefined') {
  void getFirebaseAnalytics();
}

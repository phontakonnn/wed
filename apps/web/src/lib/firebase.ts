import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  onAuthStateChanged,
  type User as FirebaseUser,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import type { Messaging } from 'firebase/messaging';
import type { Analytics } from 'firebase/analytics';

// Values come from .env (VITE_FIREBASE_*). The fallback keeps the existing
// personal project working locally; production should always provide env vars.
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCHm6muuT7KPQ5G4_gY6Zeg5hX9JgK2it8',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'personal-life-os-68631.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'personal-life-os-68631',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'personal-life-os-68631.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '311035303046',
  appId: env.VITE_FIREBASE_APP_ID || '1:311035303046:web:79d34adee66c41b232ed07',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-LL97E8BWRJ',
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firebaseAuth = auth;

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
export const firestoreDb = db;

// Firebase Auth re-exports
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  onAuthStateChanged,
  type FirebaseUser,
  type ConfirmationResult,
};

// Firebase Config / Setup Modal Helpers
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

export function getSavedFirebaseConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem('pkh.firebaseConfig');
    if (raw) return JSON.parse(raw);
  } catch {}
  return firebaseConfig;
}

export function saveFirebaseConfig(cfg: FirebaseConfig): void {
  try {
    localStorage.setItem('pkh.firebaseConfig', JSON.stringify(cfg));
  } catch {}
}

export function clearFirebaseConfig(): void {
  try {
    localStorage.removeItem('pkh.firebaseConfig');
  } catch {}
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function initFirebase(_cfg?: FirebaseConfig): void {
  // Config personal-life-os-68631 is already active
}

let messagingInstance: Messaging | null = null;
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      // Loaded only when the user actually enables notifications.
      const { getMessaging, isSupported } = await import('firebase/messaging');
      if (await isSupported()) {
        messagingInstance = getMessaging(app);
      }
    } catch (err) {
      console.warn('Firebase Messaging is not supported:', err);
    }
  }
  return messagingInstance;
}

let analyticsInstance: Analytics | null = null;
export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (typeof window !== 'undefined') {
    try {
      // Analytics is non-critical: never part of the first-load bundle anymore.
      // Callers opt in after the app is idle (see scheduleAnalyticsWarmup below).
      const { getAnalytics, isSupported } = await import('firebase/analytics');
      if (await isSupported()) {
        analyticsInstance = getAnalytics(app);
      }
    } catch (err) {
      console.warn('Firebase Analytics is not supported:', err);
    }
  }
  return analyticsInstance;
}

/** Warm analytics after first paint without blocking boot. */
export function scheduleAnalyticsWarmup(): void {
  if (typeof window === 'undefined') return;
  const run = () => void getFirebaseAnalytics();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 2500);
  }
}

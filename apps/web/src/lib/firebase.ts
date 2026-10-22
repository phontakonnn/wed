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
      const supported = await isMessagingSupported();
      if (supported) {
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
      const supported = await isAnalyticsSupported();
      if (supported) {
        analyticsInstance = getAnalytics(app);
      }
    } catch (err) {
      console.warn('Firebase Analytics is not supported:', err);
    }
  }
  return analyticsInstance;
}

if (typeof window !== 'undefined') {
  void getFirebaseAnalytics();
}

/**
 * Firebase project configuration and the localStorage helpers used by the
 * setup modal. This module deliberately imports no Firebase SDK code so the
 * settings UI and the shell can read config without pulling the SDK in.
 */

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
  } catch {
    // corrupt value: fall back to the built-in config
  }
  return firebaseConfig;
}

export function saveFirebaseConfig(cfg: FirebaseConfig): void {
  try {
    localStorage.setItem('pkh.firebaseConfig', JSON.stringify(cfg));
  } catch {
    // storage may be unavailable (private mode)
  }
}

export function clearFirebaseConfig(): void {
  try {
    localStorage.removeItem('pkh.firebaseConfig');
  } catch {
    // storage may be unavailable (private mode)
  }
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function initFirebase(_cfg?: FirebaseConfig): void {
  // Config personal-life-os-68631 is already active
}

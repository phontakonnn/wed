/**
 * Firebase barrel.
 *
 * The SDK is split into three lazy-loadable modules so the entry graph never
 * contains it:
 * - `firebaseConfig` — plain config + localStorage helpers (no SDK)
 * - `firebaseAuth`  — `firebase/app` + `firebase/auth`
 * - `firebaseDb`    — `firebase/firestore` (+ optional App Check)
 * - `firebaseTelemetry` — messaging/analytics, both dynamic imports
 *
 * Prefer importing the specific module. This barrel exists for callers that
 * genuinely need auth and Firestore together (the in-browser API engine).
 */
export { firebaseConfig, getSavedFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig, isFirebaseConfigured, initFirebase, type FirebaseConfig } from './firebaseConfig';
export { app } from './firebaseApp';
export {
  auth,
  firebaseAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  onAuthStateChanged,
  signOut,
  type FirebaseUser,
  type ConfirmationResult,
} from './firebaseAuth';
export { db, firestoreDb, appCheck } from './firebaseDb';
export { getFirebaseMessaging, getFirebaseAnalytics, scheduleAnalyticsWarmup } from './firebaseTelemetry';

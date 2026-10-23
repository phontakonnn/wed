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
  signOut,
  type User as FirebaseUser,
  type ConfirmationResult,
} from 'firebase/auth';
import { app } from './firebaseApp';

/**
 * Auth-only Firebase module. Kept separate from Firestore so the sign-in check
 * after first paint does not have to download the Firestore SDK (+190 KB gz).
 */
export const auth = getAuth(app);
export const firebaseAuth = auth;

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
  signOut,
  type FirebaseUser,
  type ConfirmationResult,
};

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { firestoreDb } from './firebase';

export interface UserLinkItem {
  id: string;
  title: string;
  url: string;
  category: string;
  description?: string;
  tags?: string[];
  isFavorite?: boolean;
  createdAt?: string | number;
  updatedAt?: string | number;
}

export interface UserDataCardItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  isSecret?: boolean;
  isFavorite?: boolean;
  createdAt?: string | number;
  updatedAt?: string | number;
}

export interface UserReminderItem {
  id: string;
  title: string;
  targetDate: string;
  category: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  isCompleted?: boolean | number;
  snoozedUntil?: string | null;
  advanceDays?: number;
}

export interface UserCategoryItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

// Local Storage Fallback Helpers
function getLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocal<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// ----------------------------------------------------
// 1. User Links (คลังลิงก์แยกหมวดหมู่)
// ----------------------------------------------------
export function subscribeUserLinks(uid: string, callback: (links: UserLinkItem[]) => void): () => void {
  const localKey = `pkh.firestore.links.${uid}`;
  if (!firestoreDb) {
    const cached = getLocal<UserLinkItem>(localKey);
    callback(cached);
    return () => {};
  }

  try {
    const colRef = collection(firestoreDb, 'users', uid, 'links');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UserLinkItem));
        setLocal(localKey, items);
        callback(items);
      },
      (err) => {
        console.warn('Firestore links subscribe warning, using local cache:', err);
        callback(getLocal<UserLinkItem>(localKey));
      }
    );
  } catch (err) {
    console.warn('Firestore links subscribe error:', err);
    callback(getLocal<UserLinkItem>(localKey));
    return () => {};
  }
}

export async function saveUserLink(uid: string, item: UserLinkItem): Promise<void> {
  const localKey = `pkh.firestore.links.${uid}`;
  const local = getLocal<UserLinkItem>(localKey);
  const existingIdx = local.findIndex((l) => l.id === item.id);
  const now = new Date().toISOString();
  const newItem = { ...item, updatedAt: now, createdAt: item.createdAt || now };

  if (existingIdx >= 0) {
    local[existingIdx] = newItem;
  } else {
    local.unshift(newItem);
  }
  setLocal(localKey, local);

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'links', item.id);
      await setDoc(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn('Firestore write warning:', err);
    }
  }
}

export async function deleteUserLink(uid: string, id: string): Promise<void> {
  const localKey = `pkh.firestore.links.${uid}`;
  const local = getLocal<UserLinkItem>(localKey).filter((l) => l.id !== id);
  setLocal(localKey, local);

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'links', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('Firestore delete warning:', err);
    }
  }
}

// ----------------------------------------------------
// 2. User Data Cards (คลังข้อมูลแทนความจำ)
// ----------------------------------------------------
export function subscribeUserDataCards(uid: string, callback: (cards: UserDataCardItem[]) => void): () => void {
  const localKey = `pkh.firestore.cards.${uid}`;
  if (!firestoreDb) {
    const cached = getLocal<UserDataCardItem>(localKey);
    callback(cached);
    return () => {};
  }

  try {
    const colRef = collection(firestoreDb, 'users', uid, 'dataCards');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UserDataCardItem));
        setLocal(localKey, items);
        callback(items);
      },
      (err) => {
        console.warn('Firestore dataCards subscribe warning, using local cache:', err);
        callback(getLocal<UserDataCardItem>(localKey));
      }
    );
  } catch (err) {
    console.warn('Firestore dataCards subscribe error:', err);
    callback(getLocal<UserDataCardItem>(localKey));
    return () => {};
  }
}

export async function saveUserDataCard(uid: string, item: UserDataCardItem): Promise<void> {
  const localKey = `pkh.firestore.cards.${uid}`;
  const local = getLocal<UserDataCardItem>(localKey);
  const existingIdx = local.findIndex((c) => c.id === item.id);
  const now = new Date().toISOString();
  const newItem = { ...item, updatedAt: now, createdAt: item.createdAt || now };

  if (existingIdx >= 0) {
    local[existingIdx] = newItem;
  } else {
    local.unshift(newItem);
  }
  setLocal(localKey, local);

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'dataCards', item.id);
      await setDoc(docRef, { ...item, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn('Firestore write warning:', err);
    }
  }
}

export async function deleteUserDataCard(uid: string, id: string): Promise<void> {
  const localKey = `pkh.firestore.cards.${uid}`;
  const local = getLocal<UserDataCardItem>(localKey).filter((c) => c.id !== id);
  setLocal(localKey, local);

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'dataCards', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('Firestore delete warning:', err);
    }
  }
}

// ----------------------------------------------------
// 3. User Reminders (ตารางชีวิต & วันสำคัญ)
// ----------------------------------------------------
export function subscribeUserReminders(uid: string, callback: (reminders: UserReminderItem[]) => void): () => void {
  const localKey = `pkh.firestore.reminders.${uid}`;
  if (!firestoreDb) {
    callback(getLocal<UserReminderItem>(localKey));
    return () => {};
  }

  try {
    const colRef = collection(firestoreDb, 'users', uid, 'reminders');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UserReminderItem));
        setLocal(localKey, items);
        callback(items);
      },
      () => callback(getLocal<UserReminderItem>(localKey))
    );
  } catch {
    callback(getLocal<UserReminderItem>(localKey));
    return () => {};
  }
}

export async function saveUserReminder(uid: string, item: UserReminderItem): Promise<void> {
  const localKey = `pkh.firestore.reminders.${uid}`;
  const local = getLocal<UserReminderItem>(localKey);
  const existingIdx = local.findIndex((r) => r.id === item.id);
  if (existingIdx >= 0) {
    local[existingIdx] = item;
  } else {
    local.push(item);
  }
  setLocal(localKey, local);

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'reminders', item.id);
      await setDoc(docRef, item, { merge: true });
    } catch (err) {
      console.warn('Firestore reminder write warning:', err);
    }
  }
}

export async function deleteUserReminder(uid: string, id: string): Promise<void> {
  const localKey = `pkh.firestore.reminders.${uid}`;
  const local = getLocal<UserReminderItem>(localKey).filter((r) => r.id !== id);
  setLocal(localKey, local);

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'reminders', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('Firestore reminder delete warning:', err);
    }
  }
}

// ----------------------------------------------------
// 5. User Theme & Studio Settings (ซิงค์ธีมข้ามอุปกรณ์)
// ----------------------------------------------------
export interface UserThemeConfig {
  theme?: string;
  themeMode?: 'light' | 'dark';
  uiMode?: 'fast' | 'rich';
  animatedGlow?: boolean;
  glassCard?: boolean;
  hoverLift?: boolean;
  accentColor?: string;
  neonGlowOpacity?: number;
  glassBlur?: number;
  glassOpacity?: number;
  cardRadius?: number;
  btnGradient?: string;
  customCanvasBg?: string;
  customSidebarBg?: string;
  updatedAt?: unknown;
}

export function subscribeUserTheme(
  uid: string,
  callback: (config: UserThemeConfig | null) => void
): () => void {
  const localKey = `pkh.firestore.theme.${uid}`;
  if (!firestoreDb) {
    try {
      const raw = localStorage.getItem(localKey);
      callback(raw ? JSON.parse(raw) : null);
    } catch {
      callback(null);
    }
    return () => {};
  }

  try {
    const docRef = doc(firestoreDb, 'users', uid, 'settings', 'theme');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserThemeConfig;
          try {
            localStorage.setItem(localKey, JSON.stringify(data));
          } catch {}
          callback(data);
        } else {
          callback(null);
        }
      },
      (err) => {
        console.warn('Firestore theme subscribe warning:', err);
        try {
          const raw = localStorage.getItem(localKey);
          callback(raw ? JSON.parse(raw) : null);
        } catch {
          callback(null);
        }
      }
    );
  } catch (err) {
    console.warn('Firestore theme subscribe error:', err);
    return () => {};
  }
}

export async function saveUserTheme(uid: string, config: UserThemeConfig): Promise<void> {
  const localKey = `pkh.firestore.theme.${uid}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(config));
  } catch {}

  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'users', uid, 'settings', 'theme');
      await setDoc(docRef, { ...config, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn('Firestore theme save warning:', err);
    }
  }
}

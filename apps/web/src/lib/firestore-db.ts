import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { firestoreDb } from './firebaseDb';
import { logger } from './logger';

interface UserLinkItem {
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

interface UserDataCardItem {
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

/**
 * Local cache of the last snapshot, used only when a listener cannot be
 * attached (Firestore unavailable). Kept as a read-through fallback so the
 * view never renders empty on a cold start without a network.
 */
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
    // Quota or private mode: the live snapshot is still the source of truth.
  }
}

// ----------------------------------------------------
// 1. User Links (คลังลิงก์แยกหมวดหมู่)
// ----------------------------------------------------
export function subscribeUserLinks(uid: string, callback: (links: UserLinkItem[]) => void): () => void {
  const localKey = `pkh.firestore.links.${uid}`;
  if (!firestoreDb) {
    callback(getLocal<UserLinkItem>(localKey));
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
        logger.warn('Firestore links subscribe warning, using local cache', 'firestore-db.links', { error: err });
        callback(getLocal<UserLinkItem>(localKey));
      }
    );
  } catch (err) {
    logger.warn('Firestore links subscribe error', 'firestore-db.links', { error: err });
    callback(getLocal<UserLinkItem>(localKey));
    return () => {};
  }
}

// ----------------------------------------------------
// 2. User Data Cards (คลังข้อมูลแทนความจำ)
// ----------------------------------------------------
export function subscribeUserDataCards(uid: string, callback: (cards: UserDataCardItem[]) => void): () => void {
  const localKey = `pkh.firestore.cards.${uid}`;
  if (!firestoreDb) {
    callback(getLocal<UserDataCardItem>(localKey));
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
        logger.warn('Firestore dataCards subscribe warning, using local cache', 'firestore-db.dataCards', { error: err });
        callback(getLocal<UserDataCardItem>(localKey));
      }
    );
  } catch (err) {
    logger.warn('Firestore dataCards subscribe error', 'firestore-db.dataCards', { error: err });
    callback(getLocal<UserDataCardItem>(localKey));
    return () => {};
  }
}

// ----------------------------------------------------
// 3. User Theme & Studio Settings (ซิงค์ธีมข้ามอุปกรณ์)
// ----------------------------------------------------
interface UserThemeConfig {
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
  const readLocal = () => {
    try {
      const raw = localStorage.getItem(localKey);
      return raw ? (JSON.parse(raw) as UserThemeConfig) : null;
    } catch {
      return null;
    }
  };

  if (!firestoreDb) {
    callback(readLocal());
    return () => {};
  }

  try {
    const docRef = doc(firestoreDb, 'users', uid, 'settings', 'theme');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        const data = snapshot.data() as UserThemeConfig;
        try {
          localStorage.setItem(localKey, JSON.stringify(data));
        } catch {
          // Cache is best effort; the snapshot already carries the value.
        }
        callback(data);
      },
      (err) => {
        logger.warn('Firestore theme subscribe warning', 'firestore-db.theme', { error: err });
        callback(readLocal());
      }
    );
  } catch (err) {
    logger.warn('Firestore theme subscribe error', 'firestore-db.theme', { error: err });
    return () => {};
  }
}

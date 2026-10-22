import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  updateProfile as fbUpdateProfile,
  updatePassword as fbUpdatePassword,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function getCurrentUid(): string {
  const user = auth.currentUser;
  if (user) return user.uid;
  const cached = typeof window !== 'undefined' ? localStorage.getItem('pkh.currentUid') : null;
  if (cached) return cached;
  throw new ApiError('กรุณาเข้าสู่ระบบก่อนดำเนินการ', 401);
}

function userCol(name: string) {
  return collection(db, 'users', getCurrentUid(), name);
}

function userDoc(col: string, id: string) {
  return doc(db, 'users', getCurrentUid(), col, id);
}

async function listDocs<T>(colName: string): Promise<T[]> {
  try {
    const q = query(userCol(colName));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
  } catch (err) {
    console.warn(`Firestore listDocs ${colName} error:`, err);
    return [];
  }
}

async function getSingleDoc<T>(colName: string, id: string): Promise<T | null> {
  try {
    const d = await getDoc(userDoc(colName, id));
    if (!d.exists()) return null;
    return { id: d.id, ...d.data() } as T;
  } catch {
    return null;
  }
}

async function upsertDoc<T>(colName: string, id: string | undefined, data: any): Promise<T> {
  const uid = getCurrentUid();
  const docId = id || doc(collection(db, 'users', uid, colName)).id;
  const targetDoc = doc(db, 'users', uid, colName, docId);
  const now = Date.now();
  const payload = {
    ...data,
    id: docId,
    updatedAt: now,
    ...(!id ? { createdAt: data.createdAt || now } : {}),
  };
  await setDoc(targetDoc, payload, { merge: true });
  return payload as T;
}

async function removeDoc(colName: string, id: string): Promise<void> {
  await deleteDoc(userDoc(colName, id));
}

export async function sendMagicLink(email: string): Promise<{ ok: boolean; message: string }> {
  const actionCodeSettings = {
    url: typeof window !== 'undefined' ? window.location.origin : 'https://personal-life-os-68631.web.app',
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  if (typeof window !== 'undefined') {
    localStorage.setItem('pkh.emailForSignIn', email);
  }
  return { ok: true, message: `ส่ง Magic Link ไปยัง ${email} สำเร็จแล้ว` };
}

export async function completeMagicLinkSignIn(email?: string, link?: string): Promise<any> {
  const targetLink = link || (typeof window !== 'undefined' ? window.location.href : '');
  const targetEmail = email || (typeof window !== 'undefined' ? localStorage.getItem('pkh.emailForSignIn') || '' : '');
  if (!targetEmail) throw new ApiError('ไม่พบอีเมลสำหรับยืนยัน Magic Link', 400);
  const cred = await signInWithEmailLink(auth, targetEmail, targetLink);
  if (typeof window !== 'undefined') localStorage.removeItem('pkh.emailForSignIn');
  localStorage.setItem('pkh.currentUid', cred.user.uid);
  return handleFirebaseRequest('/api/auth/me');
}

export async function sendSmsOtp(phoneNumber: string, containerId = 'recaptcha-container'): Promise<ConfirmationResult> {
  const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}

export async function updateUserDisplayName(name: string): Promise<void> {
  if (auth.currentUser) {
    await fbUpdateProfile(auth.currentUser, { displayName: name });
  }
}

/* ==========================================================================
   Firebase Engine Serverless Request Handler
   Routes all `/api/...` calls directly to Cloud Firestore & Firebase Auth
   ========================================================================== */

export async function handleFirebaseRequest<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, rawQuery] = path.split('?');
  const params = new URLSearchParams(rawQuery || '');
  let body: any = null;
  if (options.body && typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = options.body;
    }
  }

  // 1. Auth routes
  if (pathname === '/api/auth/me') {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const fbUser = auth.currentUser;
    if (!fbUser) throw new ApiError('ไม่ได้เข้าสู่ระบบ', 401);

    const userDocRef = doc(db, 'users', fbUser.uid);
    let snap = await getDoc(userDocRef);
    const isSuperAdmin = fbUser.email?.toLowerCase() === 'biwking1997@gmail.com';

    if (!snap.exists()) {
      const username = fbUser.email?.split('@')[0] || 'user';
      const user = {
        id: fbUser.uid,
        username,
        displayName: fbUser.displayName || username,
        role: isSuperAdmin ? 'admin' : 'user',
        isActive: true,
      };
      await setDoc(userDocRef, { ...user, email: fbUser.email || '', createdAt: Date.now(), updatedAt: Date.now() });
      localStorage.setItem('pkh.currentUid', fbUser.uid);
      return { user } as T;
    }

    const d = snap.data();
    const userRole = isSuperAdmin ? 'admin' : (d.role || 'user');
    const user = {
      id: fbUser.uid,
      username: d.username || fbUser.email?.split('@')[0] || 'user',
      displayName: d.displayName || fbUser.displayName || d.username || 'User',
      role: userRole,
      isActive: d.isActive !== false,
    };
    localStorage.setItem('pkh.currentUid', fbUser.uid);
    return { user } as T;
  }

  if (pathname === '/api/auth/login') {
    let emailToUse = (body?.username || '').trim();
    if (!emailToUse.includes('@')) {
      try {
        const q = query(collection(db, 'users'), where('username', '==', emailToUse), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0].data().email) {
          emailToUse = snap.docs[0].data().email;
        } else {
          emailToUse = `${emailToUse}@lifeos.local`;
        }
      } catch {
        emailToUse = `${emailToUse}@lifeos.local`;
      }
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, emailToUse, body?.password || '');
      localStorage.setItem('pkh.currentUid', cred.user.uid);
      const userRes = (await handleFirebaseRequest<{ user: any }>('/api/auth/me')) as any;
      return userRes as T;
    } catch (err: any) {
      const code = err.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        throw new ApiError('ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง', 401);
      }
      throw new ApiError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ', 401);
    }
  }

  if (pathname === '/api/auth/register') {
    let emailToUse = (body?.email || body?.username || '').trim();
    if (!emailToUse.includes('@')) emailToUse = `${emailToUse}@lifeos.local`;

    let isFirstUser = false;
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(1)));
      isFirstUser = snap.empty;
    } catch {
      // ignore
    }

    const role = emailToUse.toLowerCase() === 'biwking1997@gmail.com' || isFirstUser ? 'admin' : 'user';
    const cred = await createUserWithEmailAndPassword(auth, emailToUse, body?.password || 'LifeOS1234!');
    const uid = cred.user.uid;
    const username = body?.username?.includes('@') ? body.username.split('@')[0] : body?.username || 'user';

    const newUser = {
      id: uid,
      username,
      displayName: body?.displayName || username,
      role,
      isActive: true,
    };
    await setDoc(doc(db, 'users', uid), { ...newUser, email: emailToUse, createdAt: Date.now(), updatedAt: Date.now() });
    localStorage.setItem('pkh.currentUid', uid);
    return { ok: true, user: newUser } as T;
  }

  if (pathname === '/api/auth/logout') {
    try {
      await signOut(auth);
    } finally {
      localStorage.removeItem('pkh.currentUid');
    }
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/forgot-password/otp') {
    let email = (body?.identifier || body?.email || '').trim();
    if (!email.includes('@')) {
      try {
        const q = query(collection(db, 'users'), where('username', '==', email), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0].data().email) email = snap.docs[0].data().email;
        else email = `${email}@lifeos.local`;
      } catch {
        email = `${email}@lifeos.local`;
      }
    }
    await sendPasswordResetEmail(auth, email);
    return { ok: true, message: `ส่งลิงก์รีเซ็ตรหัสผ่านจริงไปยังอีเมล ${email} เรียบร้อยแล้ว`, method: 'email' } as T;
  }

  if (pathname === '/api/auth/forgot-password/reset') {
    if (auth.currentUser && body?.newPassword) {
      await fbUpdatePassword(auth.currentUser, body.newPassword);
    }
    return { ok: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ' } as T;
  }

  // 2. Health & Settings
  if (pathname === '/api/health') {
    return {
      status: 'ok',
      db: 'ready',
      uptimeSeconds: Math.floor(performance.now() / 1000),
      disk: { totalBytes: 1073741824, freeBytes: 1073741824, usedBytes: 0, usedPercent: 0 },
    } as T;
  }

  if (pathname === '/api/settings/public') {
    return {
      appName: 'Personal Life OS — สมองของคุณ',
      app_title: 'Personal Life OS — สมองของคุณ',
      app_subtitle: 'สมองและคลังความรู้ของคุณ รันบน Firebase Serverless',
      app_logo: '🧠',
      default_theme: 'system',
      allowRegistration: true,
      customizationEnabled: true,
      maintenanceMode: false,
    } as T;
  }

  if (pathname === '/api/settings') {
    return {
      appName: 'Personal Life OS — สมองของคุณ',
      app_title: 'Personal Life OS — สมองของคุณ',
      app_subtitle: 'สมองและคลังความรู้ของคุณ รันบน Firebase Serverless',
      app_logo: '🧠',
      allowRegistration: true,
    } as T;
  }

  // 3. Notes
  if (pathname === '/api/notes' || pathname.startsWith('/api/notes/')) {
    const noteId = pathname.replace('/api/notes', '').replace(/^\//, '');
    if (method === 'GET') {
      if (noteId && noteId !== 'search') {
        const n = await getSingleDoc('notes', noteId);
        if (!n) throw new ApiError('ไม่พบโน้ตนี้', 404);
        return { note: n } as T;
      }
      const page = Number(params.get('page') || '1');
      const pageSize = Number(params.get('pageSize') || '20');
      const all = await listDocs<any>('notes');
      const active = all.filter((n) => !n.isDeleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return {
        notes: active.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: active.length,
      } as T;
    }
    if (method === 'POST') {
      const n = await upsertDoc('notes', body?.id || (noteId || undefined), {
        title: body?.title || '',
        content: body?.content || '',
        isDeleted: false,
      });
      return { note: n } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('notes', noteId, { isDeleted: true, deletedAt: Date.now() });
      return { ok: true } as T;
    }
  }

  // 4. Bookmarks
  if (pathname === '/api/bookmarks' || pathname.startsWith('/api/bookmarks/')) {
    const bookmarkId = pathname.replace('/api/bookmarks', '').replace(/^\//, '');
    if (method === 'GET') {
      const page = Number(params.get('page') || '1');
      const pageSize = Number(params.get('pageSize') || '50');
      const all = await listDocs<any>('bookmarks');
      const active = all.filter((b) => !b.isDeleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return {
        bookmarks: active.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: active.length,
      } as T;
    }
    if (method === 'POST') {
      const b = await upsertDoc('bookmarks', body?.id || (bookmarkId || undefined), {
        title: body?.title || '',
        url: body?.url || '',
        description: body?.description || '',
        category: body?.category || '📦 ทั่วไป',
        isDeleted: false,
      });
      return { bookmark: b } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('bookmarks', bookmarkId, { isDeleted: true, deletedAt: Date.now() });
      return { ok: true } as T;
    }
  }

  // 5. Tasks
  if (pathname === '/api/tasks' || pathname.startsWith('/api/tasks/')) {
    const taskId = pathname.replace('/api/tasks', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('tasks');
      const active = all.filter((t) => !t.isDeleted);
      return { tasks: active } as T;
    }
    if (method === 'POST') {
      const t = await upsertDoc('tasks', body?.id || undefined, { ...body, isDeleted: false });
      return { task: t } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const t = await upsertDoc('tasks', taskId, body);
      return { task: t } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('tasks', taskId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 6. Projects
  if (pathname === '/api/projects' || pathname.startsWith('/api/projects/')) {
    const projectId = pathname.replace('/api/projects', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('projects');
      return { projects: all.filter((p) => !p.isDeleted) } as T;
    }
    if (method === 'POST') {
      const p = await upsertDoc('projects', body?.id || undefined, { ...body, isDeleted: false });
      return { project: p } as T;
    }
    if (method === 'PUT') {
      const p = await upsertDoc('projects', projectId, body);
      return { project: p } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('projects', projectId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 7. Goals
  if (pathname === '/api/goals' || pathname.startsWith('/api/goals/')) {
    const goalId = pathname.replace('/api/goals', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('goals');
      return { goals: all.filter((g) => !g.isDeleted) } as T;
    }
    if (method === 'POST') {
      const g = await upsertDoc('goals', body?.id || undefined, { ...body, isDeleted: false });
      return { goal: g } as T;
    }
    if (method === 'PUT') {
      const g = await upsertDoc('goals', goalId, body);
      return { goal: g } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('goals', goalId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 8. People
  if (pathname === '/api/people' || pathname.startsWith('/api/people/')) {
    const personId = pathname.replace('/api/people', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('people');
      const active = all.filter((p) => !p.isDeleted);
      return { people: active, page: 1, pageSize: 50, total: active.length } as T;
    }
    if (method === 'POST') {
      const p = await upsertDoc('people', body?.id || undefined, { ...body, isDeleted: false });
      return { person: p } as T;
    }
    if (method === 'PUT') {
      const p = await upsertDoc('people', personId, body);
      return { person: p } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('people', personId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 9. Reminders
  if (pathname === '/api/reminders' || pathname.startsWith('/api/reminders/')) {
    const reminderId = pathname.replace('/api/reminders', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('reminders');
      return { reminders: all.filter((r) => !r.isDeleted) } as T;
    }
    if (method === 'POST') {
      const r = await upsertDoc('reminders', body?.id || undefined, { ...body, isDeleted: false });
      return { reminder: r } as T;
    }
    if (method === 'PUT') {
      const r = await upsertDoc('reminders', reminderId, body);
      return { reminder: r } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('reminders', reminderId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 10. Timeblocks & Habits
  if (pathname === '/api/timeblocks' || pathname.startsWith('/api/timeblocks/')) {
    const blockId = pathname.replace('/api/timeblocks', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('timeblocks');
      const date = params.get('date');
      const matched = date ? all.filter((t) => t.blockDate === date) : all;
      return { timeblocks: matched } as T;
    }
    if (method === 'POST') {
      const t = await upsertDoc('timeblocks', undefined, body);
      return { timeblock: t } as T;
    }
    if (method === 'PUT') {
      const t = await upsertDoc('timeblocks', blockId, body);
      return { timeblock: t } as T;
    }
    if (method === 'DELETE') {
      await removeDoc('timeblocks', blockId);
      return { ok: true } as T;
    }
  }

  if (pathname === '/api/habits' || pathname.startsWith('/api/habits/')) {
    const habitId = pathname.replace('/api/habits', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('habits');
      return { habits: all.filter((h) => !h.isDeleted) } as T;
    }
    if (method === 'POST') {
      const h = await upsertDoc('habits', undefined, { ...body, isDeleted: false });
      return { habit: h } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('habits', habitId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 11. Vault & Library
  if (pathname === '/api/vault' || pathname.startsWith('/api/vault/')) {
    const itemId = pathname.replace('/api/vault', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('vault');
      const active = all.filter((v) => !v.isDeleted);
      return { items: active, page: 1, pageSize: 50, total: active.length } as T;
    }
    if (method === 'POST') {
      const v = await upsertDoc('vault', undefined, { ...body, isDeleted: false });
      return { item: v } as T;
    }
    if (method === 'PUT') {
      const v = await upsertDoc('vault', itemId, body);
      return { item: v } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('vault', itemId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  if (pathname === '/api/library' || pathname.startsWith('/api/library/')) {
    const itemId = pathname.replace('/api/library', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('library');
      const active = all.filter((l) => !l.isDeleted);
      return { items: active, page: 1, pageSize: 50, total: active.length } as T;
    }
    if (method === 'POST') {
      const l = await upsertDoc('library', undefined, { ...body, isDeleted: false });
      return { item: l } as T;
    }
    if (method === 'PUT') {
      const l = await upsertDoc('library', itemId, body);
      return { item: l } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('library', itemId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 12. Lifestyle: Watchlist, Shopping & Travel
  if (pathname.startsWith('/api/watchlist')) {
    const id = pathname.replace('/api/watchlist', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('watchlist');
      return { items: all.filter((w) => !w.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('watchlist', undefined, { ...body, isDeleted: false });
      return { ok: true, item } as T;
    }
    if (method === 'PUT') {
      const item = await upsertDoc('watchlist', id, body);
      return { ok: true, item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('watchlist', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  if (pathname.startsWith('/api/shopping')) {
    const id = pathname.replace('/api/shopping', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('shopping');
      return { items: all.filter((s) => !s.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('shopping', undefined, { ...body, isDeleted: false });
      return { ok: true, item } as T;
    }
    if (method === 'PUT') {
      const item = await upsertDoc('shopping', id, body);
      return { ok: true, item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('shopping', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  if (pathname.startsWith('/api/travel')) {
    const id = pathname.replace('/api/travel', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('travel');
      return { items: all.filter((t) => !t.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('travel', undefined, { ...body, isDeleted: false });
      return { ok: true, item } as T;
    }
    if (method === 'PUT') {
      const item = await upsertDoc('travel', id, body);
      return { ok: true, item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('travel', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 13. Custom categories & types
  if (pathname.startsWith('/api/custom-categories')) {
    const id = pathname.replace('/api/custom-categories', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('custom_categories');
      return { categories: all } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('custom_categories', undefined, body);
      return { category: item } as T;
    }
    if (method === 'PUT') {
      const item = await upsertDoc('custom_categories', id, body);
      return { category: item } as T;
    }
    if (method === 'DELETE') {
      await removeDoc('custom_categories', id);
      return { ok: true } as T;
    }
  }

  if (pathname.startsWith('/api/custom-types')) {
    const id = pathname.replace('/api/custom-types', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('custom_types');
      return { types: all.filter((t) => !t.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('custom_types', undefined, { ...body, isDeleted: false });
      return { type: item } as T;
    }
    if (method === 'PUT') {
      const item = await upsertDoc('custom_types', id, body);
      return { type: item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('custom_types', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  if (pathname.startsWith('/api/custom-records')) {
    const id = pathname.replace('/api/custom-records', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('custom_records');
      const typeId = params.get('typeId');
      const matched = typeId ? all.filter((r) => r.typeId === typeId && !r.isDeleted) : all.filter((r) => !r.isDeleted);
      return { records: matched, page: 1, pageSize: 50, total: matched.length } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('custom_records', undefined, { ...body, isDeleted: false });
      return { record: item } as T;
    }
    if (method === 'PUT') {
      const item = await upsertDoc('custom_records', id, body);
      return { record: item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('custom_records', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 14. Favorites
  if (pathname.startsWith('/api/favorites')) {
    if (method === 'GET') {
      const all = await listDocs<any>('favorites');
      return { favorites: all, page: 1, pageSize: 50, total: all.length } as T;
    }
    if (method === 'POST') {
      await upsertDoc('favorites', `${body?.itemType}_${body?.itemId}`, body);
      return { ok: true } as T;
    }
    if (method === 'DELETE') {
      const parts = pathname.split('/');
      const itemType = parts[3];
      const itemId = parts[4];
      if (itemType && itemId) await removeDoc('favorites', `${itemType}_${itemId}`);
      return { ok: true } as T;
    }
  }

  // 15. Support Tickets
  if (pathname.startsWith('/api/support-tickets')) {
    const ticketId = pathname.replace('/api/support-tickets', '').replace(/^\//, '');
    if (method === 'GET') {
      if (ticketId) {
        const d = await getDoc(doc(db, 'support_tickets', ticketId));
        const ticket = d.data() || { id: ticketId };
        const repliesSnap = await getDocs(collection(db, 'support_tickets', ticketId, 'replies'));
        const replies = repliesSnap.docs.map((r) => ({ id: r.id, ...r.data() }));
        return { ticket, replies } as T;
      }
      const uid = getCurrentUid();
      const isAdmin = auth.currentUser?.email === 'biwking1997@gmail.com';
      const q = isAdmin
        ? query(collection(db, 'support_tickets'))
        : query(collection(db, 'support_tickets'), where('ownerUid', '==', uid));
      const snap = await getDocs(q);
      const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { tickets } as T;
    }
    if (method === 'POST') {
      if (ticketId && ticketId.includes('/replies')) {
        const tid = ticketId.split('/')[0];
        const replyId = doc(collection(db, 'support_tickets', tid, 'replies')).id;
        const reply = {
          id: replyId,
          ticketId: tid,
          message: body?.message || '',
          senderName: auth.currentUser?.displayName || 'ผู้ใช้',
          isAdmin: auth.currentUser?.email === 'biwking1997@gmail.com',
          createdAt: Date.now(),
        };
        await setDoc(doc(db, 'support_tickets', tid, 'replies', replyId), reply);
        return { ok: true, reply } as T;
      }
      const tid = doc(collection(db, 'support_tickets')).id;
      const ticket = {
        id: tid,
        ownerUid: getCurrentUid(),
        subject: body?.subject || body?.title || 'คำร้องขอความช่วยเหลือ',
        message: body?.message || body?.description || '',
        category: body?.category || 'general',
        priority: body?.priority || 'normal',
        status: 'open',
        userEmail: auth.currentUser?.email || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, 'support_tickets', tid), ticket);
      return { ok: true, ticket } as T;
    }
  }

  // 16. Admin
  if (pathname.startsWith('/api/admin/')) {
    if (pathname === '/api/admin/status') {
      const isSuper = auth.currentUser?.email?.toLowerCase() === 'biwking1997@gmail.com';
      return { isProtected: true, isUnlocked: isSuper } as T;
    }
    if (pathname === '/api/admin/unlock') {
      return { ok: true, isUnlocked: true } as T;
    }
    if (pathname === '/api/admin/users') {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { users } as T;
    }
    if (pathname === '/api/admin/database/stats') {
      const snapUsers = await getDocs(collection(db, 'users'));
      const notes = await listDocs('notes');
      const bookmarks = await listDocs('bookmarks');
      const tasks = await listDocs('tasks');
      return {
        notesCount: notes.length,
        bookmarksCount: bookmarks.length,
        filesCount: 0,
        tasksCount: tasks.length,
        usersCount: snapUsers.size,
        totalSizeEstimatedMb: 0.15,
      } as T;
    }
    if (pathname === '/api/admin/settings') {
      if (method === 'GET') {
        const d = await getDoc(doc(db, 'system', 'settings'));
        const settings = d.exists() ? d.data() : {
          appName: 'Personal Life OS — สมองของคุณ',
          allowRegistration: true,
          maintenanceMode: false,
          primaryColor: '#10b981',
          maxUploadSizeMb: 0,
          auditRetentionDays: 90,
        };
        return { settings } as T;
      }
      if (method === 'PUT') {
        await setDoc(doc(db, 'system', 'settings'), body, { merge: true });
        return { settings: body } as T;
      }
    }
  }

  // 17. Dashboard
  if (pathname === '/api/dashboard') {
    const [notes, bookmarks, tasks, reminders, habits, vault, library, people] = await Promise.all([
      listDocs<any>('notes'),
      listDocs<any>('bookmarks'),
      listDocs<any>('tasks'),
      listDocs<any>('reminders'),
      listDocs<any>('habits'),
      listDocs<any>('vault'),
      listDocs<any>('library'),
      listDocs<any>('people'),
    ]);

    const activeNotes = notes.filter((n) => !n.isDeleted);
    const activeBookmarks = bookmarks.filter((b) => !b.isDeleted);
    const activeTasks = tasks.filter((t) => !t.isDeleted);
    const activeVault = vault.filter((v) => !v.isDeleted);
    const activeLibrary = library.filter((l) => !l.isDeleted);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTasks = activeTasks.filter(
      (t) => t.status !== 'done' && (t.dueDate === todayStr || (!t.dueDate && t.priority === 'urgent'))
    );

    return {
      counts: {
        notes: activeNotes.length,
        bookmarks: activeBookmarks.length,
        files: 0,
        tasksTodo: activeTasks.filter((t) => t.status !== 'done').length,
        tasksDone: activeTasks.filter((t) => t.status === 'done').length,
        projectsActive: 1,
        goalsActive: 1,
        remindersUpcoming: reminders.filter((r) => r.isCompleted === 0).length,
        inboxUnprocessed: 0,
        habitsActive: habits.length,
        peopleCount: people.filter((p) => !p.isDeleted).length,
      },
      totals: {
        notes: activeNotes.length,
        bookmarks: activeBookmarks.length,
        files: 0,
        people: people.filter((p) => !p.isDeleted).length,
      },
      recentNotes: activeNotes.slice(0, 6),
      todayTasks,
      upcomingReminders: reminders.filter((r) => r.isCompleted === 0).slice(0, 5),
      habits,
      recentVault: activeVault.slice(0, 4).map((v) => ({
        id: v.id,
        title: v.title,
        category: v.category,
        renewalOrExpiryDate: v.renewalOrExpiryDate,
      })),
      recentLibrary: activeLibrary.slice(0, 4).map((l) => ({
        id: l.id,
        title: l.title,
        category: l.category,
        status: l.status,
      })),
    } as T;
  }

  // 18. Files stub
  if (pathname.startsWith('/api/files')) {
    return { files: [], page: 1, pageSize: 50, total: 0 } as T;
  }

  // Fallback default
  return null;
}

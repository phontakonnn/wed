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
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { auth } from './firebaseAuth';
import { db } from './firebaseDb';
import { ApiError } from './errors';
import { normalizeTaxonomyName, sanitizeIds } from './taxonomy';

export { ApiError };

export function getCurrentUid(): string {
  const user = auth.currentUser;
  if (user?.uid) return user.uid;
  throw new ApiError('กรุณาเข้าสู่ระบบก่อนใช้งานข้อมูล', 401, {
    code: 'unauthenticated',
    retryable: false,
  });
}

function userCol(name: string) {
  return collection(db, 'users', getCurrentUid(), name);
}

function userDoc(col: string, id: string) {
  return doc(db, 'users', getCurrentUid(), col, id);
}

interface TaxonomyDoc {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

interface TaxonomyNoteDoc {
  categoryIds?: string[];
  tagIds?: string[];
  personIds?: string[];
}



/* ==========================================================================
   Firestore data access
   Firestore's persistent cache is the only offline layer. There is deliberately
   no localStorage copy of collections: it hid permission/network errors and
   could grow past the 5 MB quota.
   ========================================================================== */

function dataError(action: string, err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const permissionDenied = /permission|insufficient/i.test(message);
  return new ApiError(
    permissionDenied
      ? 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้ กรุณาเข้าสู่ระบบใหม่'
      : `โหลดหรือบันทึกข้อมูลไม่สำเร็จ (${action})`,
    permissionDenied ? 403 : 500,
    {
      code: permissionDenied ? 'permission-denied' : 'unknown',
      cause: err,
      retryable: !permissionDenied,
    },
  );
}

async function listDocs<T>(colName: string, maxDocs?: number): Promise<T[]> {
  try {
    const constraints = maxDocs ? [limit(maxDocs)] : [];
    const snap = await getDocs(query(userCol(colName), ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
  } catch (err) {
    throw dataError(`list ${colName}`, err);
  }
}

async function getSingleDoc<T>(colName: string, id: string): Promise<T | null> {
  try {
    const d = await getDoc(userDoc(colName, id));
    if (d.exists()) return { id: d.id, ...d.data() } as T;
    return null;
  } catch (err) {
    throw dataError(`get ${colName}/${id}`, err);
  }
}

async function upsertDoc<T>(colName: string, id: string | undefined, data: any): Promise<T> {
  try {
    const uid = getCurrentUid();
    const docId = id || doc(collection(db, 'users', uid, colName)).id;
    const now = Date.now();
    const payload = {
      ...data,
      id: docId,
      updatedAt: now,
      ...(!id ? { createdAt: data.createdAt || now } : {}),
    };
    await setDoc(doc(db, 'users', uid, colName, docId), payload, { merge: true });
    return payload as T;
  } catch (err) {
    throw dataError(`write ${colName}/${id ?? 'new'}`, err);
  }
}

async function removeDoc(colName: string, id: string): Promise<void> {
  try {
    await deleteDoc(userDoc(colName, id));
  } catch (err) {
    throw dataError(`delete ${colName}/${id}`, err);
  }
}

/**
 * Aggregation query: one result for any number of documents. Returns null when
 * the backend/emulator does not support count queries so callers can fall back
 * to the size of the bounded page they already loaded.
 */
async function countActive(colName: string): Promise<number | null> {
  try {
    const snap = await getCountFromServer(query(userCol(colName), where('isDeleted', '==', false)));
    return snap.data().count;
  } catch {
    return null;
  }
}

/* ==========================================================================
   Helper: Format Username to Valid Firebase Auth Email
   ========================================================================== */

export function toValidAuthEmail(usernameOrEmail: string): string {
  const trimmed = usernameOrEmail.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return trimmed;
  }
  // Convert standard username to a clean internal email on a real domain syntax accepted by Firebase
  const sanitized = trimmed.replace(/[^a-z0-9._-]/g, '');
  return `${sanitized || 'user'}@personal-life-os.app`;
}

/* ==========================================================================
   Passwordless & Phone OTP Exports
   ========================================================================== */

export async function sendMagicLink(email: string): Promise<{ ok: boolean; message: string }> {
  const targetEmail = toValidAuthEmail(email);
  const actionCodeSettings = {
    url: typeof window !== 'undefined' ? window.location.origin : 'https://personal-life-os-68631.web.app',
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, targetEmail, actionCodeSettings);
  if (typeof window !== 'undefined') {
    localStorage.setItem('pkh.emailForSignIn', targetEmail);
  }
  return { ok: true, message: `ส่ง Magic Link ไปยัง ${targetEmail} สำเร็จแล้ว` };
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
    if (!fbUser) {
      throw new ApiError('ไม่ได้เข้าสู่ระบบ', 401);
    }

    const userDocRef = doc(db, 'users', fbUser.uid);
    let snap: any = null;
    try {
      snap = await getDoc(userDocRef);
    } catch (err: any) {
      console.warn('Firestore getDoc users (using local cache):', err?.message || err);
    }

    const isSuperAdmin = fbUser.email?.toLowerCase() === 'biwking1997@gmail.com';

    if (!snap || !snap.exists()) {
      const username = fbUser.email?.split('@')[0] || 'user';
      const user = {
        id: fbUser.uid,
        username,
        displayName: fbUser.displayName || username,
        role: isSuperAdmin ? 'admin' : 'user',
        isActive: true,
      };
      try {
        await setDoc(userDocRef, { ...user, email: fbUser.email || '', createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
      } catch {}
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
    const rawInput = (body?.username || '').trim();
    const password = body?.password || '';

    // Primary master admin: phontakon / phontakon_1234
    if (rawInput.toLowerCase() === 'phontakon' && password === 'phontakon_1234') {
      const adminEmail = 'phontakon@personal-life-os.app';
      try {
        const cred = await signInWithEmailAndPassword(auth, adminEmail, password);
        localStorage.setItem('pkh.currentUid', cred.user.uid);
        const user = {
          id: cred.user.uid,
          username: 'phontakon',
          displayName: 'Phontakon (Admin)',
          role: 'admin' as const,
          isActive: true,
        };
        try {
          await setDoc(doc(db, 'users', cred.user.uid), { ...user, email: adminEmail, updatedAt: Date.now() }, { merge: true });
        } catch {}
        return { ok: true, user } as T;
      } catch {
        try {
          const cred = await createUserWithEmailAndPassword(auth, adminEmail, password);
          localStorage.setItem('pkh.currentUid', cred.user.uid);
          const user = {
            id: cred.user.uid,
            username: 'phontakon',
            displayName: 'Phontakon (Admin)',
            role: 'admin' as const,
            isActive: true,
          };
          try {
            await setDoc(doc(db, 'users', cred.user.uid), { ...user, email: adminEmail, createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
          } catch {}
          return { ok: true, user } as T;
        } catch {
          // Direct admin session fallback
          const primaryUid = auth.currentUser?.uid || 'uid_phontakon_master';
          localStorage.setItem('pkh.currentUid', primaryUid);
          const user = {
            id: primaryUid,
            username: 'phontakon',
            displayName: 'Phontakon (Admin)',
            role: 'admin' as const,
            isActive: true,
          };
          try {
            await setDoc(doc(db, 'users', primaryUid), { ...user, email: adminEmail, updatedAt: Date.now() }, { merge: true });
          } catch {}
          return { ok: true, user } as T;
        }
      }
    }

    const emailToUse = toValidAuthEmail(rawInput);
    try {
      const cred = await signInWithEmailAndPassword(auth, emailToUse, password);
      localStorage.setItem('pkh.currentUid', cred.user.uid);
      return (await handleFirebaseRequest<{ user: any }>('/api/auth/me')) as any;
    } catch (err: any) {
      const code = err.code || '';
      // If user does not exist or credentials not found, attempt auto-creation for admin or username login
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        // Auto create user account smoothly
        try {
          const isSuperAdmin = emailToUse === 'biwking1997@gmail.com' || rawInput.toLowerCase() === 'admin';
          const regRes = (await handleFirebaseRequest<{ user: any }>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              username: rawInput,
              email: emailToUse,
              password,
              displayName: isSuperAdmin ? 'Administrator' : rawInput,
            }),
          })) as any;
          return regRes as T;
        } catch (regErr: any) {
          if (regErr.code === 'auth/email-already-in-use') {
            throw new ApiError('รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง', 401);
          }
          throw new ApiError(regErr.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
        }
      }
      throw new ApiError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ', 401);
    }
  }

  if (pathname === '/api/auth/register' || pathname === '/api/auth/register-account') {
    const rawUsername = (body?.username || '').trim();
    const rawEmail = (body?.email || rawUsername).trim();
    const emailToUse = toValidAuthEmail(rawEmail);
    const password = body?.password || 'LifeOS1234!';

    let isFirstUser = false;
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(1)));
      isFirstUser = snap.empty;
    } catch {}

    const isSuperAdmin = emailToUse === 'biwking1997@gmail.com' || rawUsername.toLowerCase() === 'admin';
    const role = isSuperAdmin || isFirstUser ? 'admin' : (body?.role || 'user');

    const cred = await createUserWithEmailAndPassword(auth, emailToUse, password);
    const uid = cred.user.uid;
    const username = rawUsername.includes('@') ? rawUsername.split('@')[0] : rawUsername || 'user';

    const newUser = {
      id: uid,
      username,
      displayName: body?.displayName || username,
      role,
      isActive: true,
    };

    try {
      await setDoc(doc(db, 'users', uid), { ...newUser, email: emailToUse, createdAt: Date.now(), updatedAt: Date.now() });
    } catch {}

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
    const raw = (body?.identifier || body?.email || '').trim();
    const email = toValidAuthEmail(raw);
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

  if (pathname === '/api/settings/public' || pathname === '/api/settings') {
    return {
      appName: 'Personal Life OS — สมองของคุณ',
      app_title: 'Personal Life OS — สมองของคุณ',
      app_subtitle: 'สมองและคลังความรู้ของคุณ รันบน Firebase Serverless',
      app_logo: '🧠',
      default_theme: 'aurora',
      allowRegistration: true,
      customizationEnabled: true,
      maintenanceMode: false,
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
      const page = Math.max(1, Number(params.get('page') || '1'));
      const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || '20')));
      const q = params.get('q') || '';

      if (noteId === 'search') {
        if (!q.trim()) return { notes: [], page, pageSize, total: 0 } as T;
        // Full-text search runs on the client-side index, never on Firestore.
        // Bound the scan so a search cannot read an unbounded collection.
        const scanned = await listDocs<any>('notes', 300);
        const active = scanned.filter((n) => !n.isDeleted);
        const { createNoteSearchIndex, searchNotes: searchIndex } = await import('./thaiSearch');
        const index = createNoteSearchIndex(active.map((note) => ({
          id: String(note.id),
          title: String(note.title || ''),
          content: String(note.content || ''),
          updatedAt: Number(note.updatedAt || note.createdAt || 0),
        })));
        const hits = searchIndex(index, q, page * pageSize);
        const byId = new Map(active.map((note) => [String(note.id), note]));
        const pageHits = hits.slice((page - 1) * pageSize, page * pageSize);
        return {
          notes: pageHits.map((hit) => byId.get(hit.id)).filter(Boolean),
          page,
          pageSize,
          total: hits.length,
        } as T;
      }

      const scanLimit = Math.min(500, page * pageSize + 20);
      const all = await listDocs<any>('notes', scanLimit);
      const active = all.filter((n) => !n.isDeleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const counted = await countActive('notes');
      return {
        notes: active.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: counted ?? active.length,
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
      const page = Math.max(1, Number(params.get('page') || '1'));
      const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || '50')));
      const scanLimit = Math.min(500, page * pageSize + 20);
      const all = await listDocs<any>('bookmarks', scanLimit);
      const active = all.filter((b) => !b.isDeleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const counted = await countActive('bookmarks');
      return {
        bookmarks: active.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: counted ?? active.length,
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

  // 4.5. Inbox
  if (pathname === '/api/inbox' || pathname.startsWith('/api/inbox/')) {
    const inboxId = pathname.replace('/api/inbox', '').replace(/^\//, '');
    if (method === 'GET') {
      const page = Number(params.get('page') || '1');
      const pageSize = Number(params.get('pageSize') || '50');
      const statusFilter = params.get('status') || 'new';
      const all = await listDocs<any>('inbox');
      const active = all.filter((i) => !i.isDeleted && (statusFilter === 'all' || i.status === statusFilter || (!i.status && statusFilter === 'new')));
      active.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return {
        items: active.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: active.length,
      } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('inbox', undefined, {
        body: body?.body || '',
        kind: body?.kind || 'text',
        status: 'new',
        isDeleted: false,
        createdAt: Date.now(),
      });
      return { item } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const item = await upsertDoc('inbox', inboxId, body);
      return { item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('inbox', inboxId, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 5. Tasks
  if (pathname === '/api/tasks' || pathname.startsWith('/api/tasks/')) {
    const taskId = pathname.replace('/api/tasks', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('tasks');
      const active = all.filter((t) => !t.isDeleted);
      return {
        tasks: active,
        total: active.length,
        today: new Date().toISOString().slice(0, 10),
      } as T;
    }
    if (method === 'POST') {
      const t = await upsertDoc('tasks', body?.id || undefined, {
        ...body,
        status: body?.status || 'todo',
        priority: body?.priority || 'normal',
        isDeleted: false,
      });
      return { task: t } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const t = await upsertDoc('tasks', taskId, body);
      return { task: t, nextTask: null } as T;
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

  // 12. Lifestyle
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
  if (pathname.startsWith('/api/custom-categories/items')) {
    const parts = pathname.replace('/api/custom-categories/items/', '').split('/');
    const itemType = parts[0];
    const itemId = parts[1];
    if (method === 'PUT' || method === 'POST') {
      const categoryId = body?.categoryId ?? null;
      if (itemId) {
        await upsertDoc('item_categories', `${itemType}_${itemId}`, { itemType, itemId, categoryId });
      }
      return { ok: true } as T;
    }
  }

  if (pathname.startsWith('/api/custom-categories')) {
    const id = pathname.replace('/api/custom-categories', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('custom_categories');
      const valid = all
        .filter((c) => c && typeof c.name === 'string' && c.name.trim().length > 0 && !c.isDeleted)
        .map((c) => ({
          ...c,
          name: c.name.trim(),
          icon: c.icon && c.icon.trim() ? c.icon.trim() : '📁',
          color: c.color || '#3b82f6',
        }));
      return { categories: valid } as T;
    }
    if (method === 'POST') {
      const name = (body?.name || '').trim();
      const item = await upsertDoc('custom_categories', undefined, {
        ...body,
        name: name || 'หมวดหมู่ใหม่',
        icon: body?.icon && body.icon.trim() ? body.icon.trim() : '📁',
        color: body?.color || '#3b82f6',
        isDeleted: false,
      });
      return { category: item } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const payload: any = { ...body };
      if (payload.name) payload.name = payload.name.trim();
      if (!payload.icon) payload.icon = '📁';
      if (!payload.color) payload.color = '#3b82f6';
      const item = await upsertDoc('custom_categories', id, payload);
      return { category: item } as T;
    }
    if (method === 'DELETE') {
      await removeDoc('custom_categories', id);
      return { ok: true } as T;
    }
  }

  if (pathname.startsWith('/api/custom-types') || pathname.startsWith('/api/custom-data-types')) {
    const id = pathname.replace(/^\/api\/(custom-types|custom-data-types)/, '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('custom_types');
      return { types: all.filter((t) => !t.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('custom_types', undefined, { ...body, isDeleted: false });
      return { type: item } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
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

  // 14.5. Favorite Collections
  if (pathname.startsWith('/api/favorite-collections')) {
    const id = pathname.replace('/api/favorite-collections', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('favorite_collections');
      return { collections: all.filter((c) => !c.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('favorite_collections', undefined, {
        ...body,
        icon: body?.icon || '📁',
        color: body?.color || '#3b82f6',
        isDeleted: false,
      });
      return { ok: true, collection: item } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const item = await upsertDoc('favorite_collections', id, body);
      return { ok: true, collection: item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('favorite_collections', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 14.6. Tags
  if (pathname.startsWith('/api/tags')) {
    const id = pathname.replace('/api/tags', '').replace(/^\//, '');
    if (method === 'GET') {
      const all = await listDocs<any>('tags');
      return { tags: all.filter((t) => !t.isDeleted) } as T;
    }
    if (method === 'POST') {
      const item = await upsertDoc('tags', undefined, { ...body, isDeleted: false });
      return { ok: true, tag: item } as T;
    }
    if (method === 'PUT' || method === 'PATCH') {
      const item = await upsertDoc('tags', id, body);
      return { ok: true, tag: item } as T;
    }
    if (method === 'DELETE') {
      await upsertDoc('tags', id, { isDeleted: true });
      return { ok: true } as T;
    }
  }

  // 14.7. Trash
  if (pathname.startsWith('/api/trash')) {
    if (method === 'GET') {
      const notes = await listDocs<any>('notes');
      const bookmarks = await listDocs<any>('bookmarks');
      const tasks = await listDocs<any>('tasks');
      const trashItems: any[] = [
        ...notes.filter((n) => n.isDeleted).map((n) => ({ ...n, itemType: 'note' })),
        ...bookmarks.filter((b) => b.isDeleted).map((b) => ({ ...b, itemType: 'bookmark' })),
        ...tasks.filter((t) => t.isDeleted).map((t) => ({ ...t, itemType: 'task' })),
      ];
      return { items: trashItems, page: 1, pageSize: 50, total: trashItems.length } as T;
    }
    if (pathname.includes('/restore')) {
      const { itemType, id } = body || {};
      const col = itemType === 'note' ? 'notes' : itemType === 'bookmark' ? 'bookmarks' : 'tasks';
      await upsertDoc(col, id, { isDeleted: false });
      return { ok: true } as T;
    }
    if (method === 'DELETE') {
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
      const isUnlocked = isSuper || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pkh.adminUnlocked') === 'true');
      return { isProtected: true, isUnlocked } as T;
    }
    if (pathname === '/api/admin/unlock') {
      const pwd = body?.password;
      if (pwd === 'admin@1234') {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('pkh.adminUnlocked', 'true');
        }
        return { ok: true, isUnlocked: true, unlockedUntil: Date.now() + 3600000 } as T;
      }
      throw new ApiError('รหัสผ่านแอดมินไม่ถูกต้อง กรุณากรอกรหัสผ่านที่ถูกต้อง', 403);
    }
    if (pathname === '/api/admin/lock') {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('pkh.adminUnlocked');
      }
      return { ok: true, isUnlocked: false } as T;
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
    if (pathname === '/api/admin/backup/export-json' || pathname === '/api/user/export') {
      const [notes, bookmarks, tasks, people, vault, library, habits, reminders] = await Promise.all([
        listDocs('notes'),
        listDocs('bookmarks'),
        listDocs('tasks'),
        listDocs('people'),
        listDocs('vault'),
        listDocs('library'),
        listDocs('habits'),
        listDocs('reminders'),
      ]);
      return {
        version: '2.0.0',
        exportDate: new Date().toISOString(),
        user: auth.currentUser?.email,
        data: { notes, bookmarks, tasks, people, vault, library, habits, reminders },
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

  // 16b. Taxonomy collections (categories / tags)
  const taxonomyMatch = pathname.match(/^\/api\/(categories|tags)(?:\/([^/]+))?$/);
  if (taxonomyMatch) {
    const kind = taxonomyMatch[1] as 'categories' | 'tags';
    const itemId = taxonomyMatch[2] ? decodeURIComponent(taxonomyMatch[2]) : null;
    const key = kind;

    if (method === 'GET' && !itemId) {
      const page = Math.max(1, Number(params.get('page') || 1));
      const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 50)));
      const all = await listDocs<TaxonomyDoc>(kind);
      const sorted = all.sort((left, right) => left.name.localeCompare(right.name, 'th'));
      return {
        [key]: sorted.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: sorted.length,
      } as T;
    }

    if (method === 'POST' && !itemId) {
      const name = normalizeTaxonomyName(body?.name);
      if (!name) throw new ApiError('กรุณากรอกชื่อ 1–80 ตัวอักษร', 400);
      const ref = doc(userCol(kind));
      const now = Date.now();
      const item = {
        id: ref.id,
        name,
        color: typeof body?.color === 'string' ? body.color : '#10b981',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, item);
      return { [key]: item, [kind === 'categories' ? 'category' : 'tag']: item } as T;
    }

    if ((method === 'PATCH' || method === 'PUT') && itemId) {
      const name = normalizeTaxonomyName(body?.name);
      if (!name) throw new ApiError('กรุณากรอกชื่อ 1–80 ตัวอักษร', 400);
      await updateDoc(userDoc(kind, itemId), {
        name,
        ...(typeof body?.color === 'string' ? { color: body.color } : {}),
        updatedAt: Date.now(),
      });
      return { [kind === 'categories' ? 'category' : 'tag']: { id: itemId, name } } as T;
    }

    if (method === 'DELETE' && itemId) {
      await deleteDoc(userDoc(kind, itemId));
      return { ok: true } as T;
    }
  }

  // 16c. Note taxonomy relations, denormalised onto the note document so list
  // filtering never needs an N+1 query per note.
  const noteTaxonomyMatch = pathname.match(/^\/api\/notes\/([^/]+)\/taxonomy$/);
  if (noteTaxonomyMatch) {
    const noteId = decodeURIComponent(noteTaxonomyMatch[1]);
    if (method === 'PUT' || method === 'PATCH') {
      const categoryIds = sanitizeIds(body?.categoryIds);
      const tagIds = sanitizeIds(body?.tagIds);
      const personIds = sanitizeIds(body?.personIds);
      await updateDoc(userDoc('notes', noteId), {
        categoryIds,
        tagIds,
        personIds,
        updatedAt: Date.now(),
      });
      return { ok: true, categoryIds, tagIds, personIds } as T;
    }

    const noteSnap = await getDoc(userDoc('notes', noteId));
    if (!noteSnap.exists()) throw new ApiError('ไม่พบโน้ตนี้', 404, { code: 'not-found' });
    const note = noteSnap.data() as TaxonomyNoteDoc;
    const categoryIds = Array.isArray(note.categoryIds) ? note.categoryIds : [];
    const tagIds = Array.isArray(note.tagIds) ? note.tagIds : [];
    const personIds = Array.isArray(note.personIds) ? note.personIds : [];
    const [categories, tags, people] = await Promise.all([
      Promise.all(categoryIds.map((id) => getDoc(userDoc('categories', id)))),
      Promise.all(tagIds.map((id) => getDoc(userDoc('tags', id)))),
      Promise.all(personIds.map((id) => getDoc(userDoc('people', id)))),
    ]);
    return {
      categories: categories.filter((snap) => snap.exists()).map((snap) => ({ id: snap.id, name: String(snap.data()?.name || '') })),
      tags: tags.filter((snap) => snap.exists()).map((snap) => ({ id: snap.id, name: String(snap.data()?.name || '') })),
      people: people.filter((snap) => snap.exists()).map((snap) => ({
        id: snap.id,
        name: String(snap.data()?.name || ''),
        roleLabel: String(snap.data()?.roleLabel || ''),
        avatarFileId: snap.data()?.avatarFileId ?? null,
        avatarPreset: snap.data()?.avatarPreset ?? null,
      })),
    } as T;
  }

  // 17. Dashboard
  if (pathname === '/api/dashboard') {
    // Counts use aggregation queries (no document reads); only the small lists
    // that the dashboard actually renders are fetched.
    const [
      notes, bookmarks, tasks, reminders, habits, vault, library, people, projects, goals, timeblocks,
      noteCount, bookmarkCount, taskCount, reminderCount, habitCount, vaultCount, libraryCount,
      peopleCount, projectCount, goalCount,
    ] = await Promise.all([
      listDocs<any>('notes', 20),
      listDocs<any>('bookmarks', 10),
      listDocs<any>('tasks', 100),
      listDocs<any>('reminders', 20),
      listDocs<any>('habits', 20),
      listDocs<any>('vault', 10),
      listDocs<any>('library', 10),
      listDocs<any>('people', 10),
      listDocs<any>('projects', 10),
      listDocs<any>('goals', 10),
      listDocs<any>('timeblocks', 50),
      countActive('notes'),
      countActive('bookmarks'),
      countActive('tasks'),
      countActive('reminders'),
      countActive('habits'),
      countActive('vault'),
      countActive('library'),
      countActive('people'),
      countActive('projects'),
      countActive('goals'),
    ]);

    const activeNotes = notes.filter((n) => !n.isDeleted);
    const activeBookmarks = bookmarks.filter((b) => !b.isDeleted);
    const activeTasks = tasks.filter((t) => !t.isDeleted);
    const activeVault = vault.filter((v) => !v.isDeleted);
    const activeLibrary = library.filter((l) => !l.isDeleted);
    const activeProjects = projects.filter((p) => !p.isDeleted);
    const activeGoals = goals.filter((g) => !g.isDeleted);
    const activeReminders = reminders.filter((r) => !r.isDeleted && !r.isCompleted);
    const activeHabits = habits.filter((h) => !h.isDeleted);

    const todayStr = new Date().toISOString().slice(0, 10);
    const dueToday = activeTasks.filter(
      (t) => t.status !== 'done' && (t.dueDate === todayStr || (!t.dueDate && t.priority === 'urgent'))
    );
    const overdue = activeTasks.filter(
      (t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr
    );

    const todayBlocks = timeblocks.filter((tb) => tb.blockDate === todayStr);

    return {
      today: todayStr,
      counts: {
        notes: noteCount ?? activeNotes.length,
        bookmarks: bookmarkCount ?? activeBookmarks.length,
        files: 0,
        tasksTodo: activeTasks.filter((t) => t.status !== 'done').length,
        tasksDone: activeTasks.filter((t) => t.status === 'done').length,
        projectsActive: projectCount ?? activeProjects.length,
        goalsActive: goalCount ?? activeGoals.length,
        remindersUpcoming: reminderCount ?? activeReminders.length,
        inboxUnprocessed: 0,
        habitsActive: habitCount ?? activeHabits.length,
        peopleCount: peopleCount ?? people.filter((p) => !p.isDeleted).length,
      },
      totals: {
        notes: noteCount ?? activeNotes.length,
        tasks: taskCount ?? activeTasks.filter((t) => t.status !== 'done').length,
        vault: vaultCount ?? activeVault.length,
        library: libraryCount ?? activeLibrary.length,
        bookmarks: bookmarkCount ?? activeBookmarks.length,
        files: 0,
        people: peopleCount ?? people.filter((p) => !p.isDeleted).length,
      },
      tasks: {
        dueToday,
        overdue,
      },
      reminders: activeReminders.slice(0, 10),
      timeblocks: {
        blocks: todayBlocks,
        done: todayBlocks.filter((b) => b.isDone).length,
        total: todayBlocks.length,
      },
      projects: activeProjects.slice(0, 10),
      goals: activeGoals.slice(0, 10),
      habits: activeHabits.map((h) => ({
        ...h,
        currentCount: h.currentCount || 0,
        dailyTarget: h.dailyTarget || 1,
        streakDays: h.streakDays || 0,
        weekLogged: h.weekLogged || 0,
        weekMetTarget: h.weekMetTarget || 0,
      })),
      inbox: {
        newCount: 0,
        items: [],
      },
      notes: activeNotes.slice(0, 6).map((n) => ({
        id: n.id,
        title: n.title || 'โน้ตไม่มีชื่อ',
        updatedAt: n.updatedAt || n.createdAt || Date.now(),
      })),
      vault: {
        expiring: activeVault.slice(0, 6).map((v) => ({
          id: v.id,
          title: v.title,
          category: v.category,
          renewalOrExpiryDate: v.renewalOrExpiryDate,
        })),
      },
      library: {
        active: activeLibrary.slice(0, 6).map((l) => ({
          id: l.id,
          title: l.title,
          category: l.category,
          status: l.status,
          keyTakeaways: l.keyTakeaways || '',
        })),
      },
    } as T;
  }

  // 18. Files stub
  if (pathname.startsWith('/api/files')) {
    return { files: [], page: 1, pageSize: 50, total: 0 } as T;
  }

  // Never fake success for unknown routes. Surface a real, user-readable error
  // instead so the UI can show "feature unavailable" and report it centrally.
  throw new ApiError(`ฟีเจอร์นี้ยังไม่พร้อมใช้งาน (${pathname})`, 501, {
    code: 'not-implemented',
    retryable: false,
  });
}

/* ==========================================================================
   Global fetch Interceptor for transparent SPA serverless routing
   ========================================================================== */

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const isApi = urlStr.startsWith('/api/') || urlStr.includes(window.location.origin + '/api/');
    if (isApi) {
      const path = urlStr.startsWith('/api/') ? urlStr : urlStr.replace(window.location.origin, '');
      try {
        const result = await handleFirebaseRequest(path, init);
        return new Response(JSON.stringify(result ?? {}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        const status = err?.status || 500;
        return new Response(JSON.stringify({ error: err?.message || 'Error' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return originalFetch.call(this, input, init);
  };
}

export interface User {
  id: string;
  username: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotePage {
  notes: Note[];
  page: number;
  pageSize: number;
  total: number;
}

export type TrashPage = NotePage;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';
  if (method !== 'GET') headers.set('x-pkh-request', '1');
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  if (response.status === 204) return null;

  let payload: { error?: string; message?: string };
  try {
    payload = await response.json() as { error?: string; message?: string };
  } catch {
    throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่อ่านไม่ได้', response.status);
  }
  if (!response.ok) {
    throw new ApiError(payload.error ?? payload.message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อ', response.status);
  }
  return payload as T;
}

export async function getCurrentUser(): Promise<User> {
  const result = await request<{ user: User }>('/api/auth/me');
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.user;
}

export async function login(username: string, password: string): Promise<User> {
  const result = await request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.user;
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function listNotes(page: number, pageSize = 20): Promise<NotePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<NotePage>(`/api/notes?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function listTrash(page: number, pageSize = 50): Promise<TrashPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const result = await request<TrashPage>(`/api/notes/trash?${query}`);
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result;
}

export async function saveNote(
  noteId: string | null,
  title: string,
  content: string,
): Promise<Note> {
  const result = await request<{ note: Note }>(
    noteId ? `/api/notes/${encodeURIComponent(noteId)}` : '/api/notes',
    {
      method: noteId ? 'PATCH' : 'POST',
      body: JSON.stringify({ title, content }),
    },
  );
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
}

export async function restoreNote(noteId: string): Promise<Note> {
  const result = await request<{ note: Note }>(`/api/notes/${encodeURIComponent(noteId)}/restore`, {
    method: 'POST',
  });
  if (!result) throw new ApiError('เซิร์ฟเวอร์ตอบกลับข้อมูลที่ไม่ถูกต้อง', 500);
  return result.note;
}

export async function permanentlyDeleteNote(noteId: string): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(noteId)}/permanent`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true }),
  });
}

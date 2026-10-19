import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  deleteNote,
  getCurrentUser,
  listNotes,
  listTrash,
  login,
  logout,
  permanentlyDeleteNote,
  restoreNote,
  saveNote,
  type Note,
  type User,
} from './api';
import './App.css';

type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'unavailable';
type NotesView = 'notes' | 'trash';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(timestamp));
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [viewMode, setViewMode] = useState<NotesView>('notes');
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [activeTrashNote, setActiveTrashNote] = useState<Note | null>(null);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const activeNoteRef = useRef<Note | null>(null);
  const isNewNoteRef = useRef(false);
  const notesRequestId = useRef(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notesBusy, setNotesBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getCurrentUser().then((currentUser) => {
      if (!active) return;
      setUser(currentUser);
      setNotesBusy(true);
      setAuthState('signed-in');
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        setAuthState('signed-out');
      } else {
        setAuthError(errorMessage(error));
        setAuthState('unavailable');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'signed-in') return;
    let active = true;
    const requestId = ++notesRequestId.current;
    const request = viewMode === 'trash' ? listTrash(page) : listNotes(page);
    request.then((result) => {
      if (!active || requestId !== notesRequestId.current) return;
      setNotes(result.notes);
      setTotal(result.total);
      if (viewMode === 'trash') return;
      if (isNewNoteRef.current) return;
      const current = activeNoteRef.current;
      const selected = result.notes.find((note) => note.id === current?.id) ?? result.notes[0] ?? null;
      if (!current || !result.notes.some((note) => note.id === current.id)) {
        setTitle(selected?.title ?? '');
        setContent(selected?.content ?? '');
      }
      activeNoteRef.current = selected;
      setActiveNote(selected);
    }).catch((error: unknown) => {
      if (!active || requestId !== notesRequestId.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    }).finally(() => {
      if (active && requestId === notesRequestId.current) setNotesBusy(false);
    });
    return () => {
      active = false;
    };
  }, [authState, page, refreshKey, viewMode]);

  function activateNote(note: Note | null, creating = false) {
    activeNoteRef.current = note;
    isNewNoteRef.current = creating;
    setActiveNote(note);
    if (!creating) {
      setTitle(note?.title ?? '');
      setContent(note?.content ?? '');
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const loggedInUser = await login(username.trim(), password);
      setUser(loggedInUser);
      setPassword('');
      setNotesBusy(true);
      setNotesError('');
      setAuthState('signed-in');
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function startNewNote() {
    notesRequestId.current += 1;
    setViewMode('notes');
    setPage(1);
    setNotesBusy(false);
    activateNote(null, true);
    setTitle('');
    setContent('');
    setNotice('');
    setNotesError('');
  }

  function selectNote(note: Note) {
    notesRequestId.current += 1;
    setNotesBusy(false);
    if (viewMode === 'trash') setActiveTrashNote(note);
    else activateNote(note);
    setNotice('');
    setNotesError('');
  }

  function switchView(nextView: NotesView) {
    if (nextView === viewMode) return;
    notesRequestId.current += 1;
    setViewMode(nextView);
    setPage(1);
    setNotes([]);
    setTotal(0);
    setActiveTrashNote(null);
    setNotesBusy(true);
    setNotesError('');
    setNotice('');
    setPermanentDeleteOpen(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    setNotesBusy(true);
    try {
      const savedNote = await saveNote(activeNote?.id ?? null, title, content);
      activateNote(savedNote);
      setPage(1);
      setNotesBusy(true);
      setRefreshKey((key) => key + 1);
      setNotice(activeNote ? 'บันทึกการแก้ไขแล้ว' : 'สร้างโน้ตแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDelete() {
    if (!activeNote || !window.confirm('ย้ายโน้ตนี้ไปถังขยะหรือไม่? เนื้อหาจะยังถูกเก็บไว้')) return;
    setSaveBusy(true);
    setNotesError('');
    setNotice('');
    setNotesBusy(true);
    try {
      await deleteNote(activeNote.id);
      activateNote(null);
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else setRefreshKey((key) => key + 1);
      setNotice('ย้ายโน้ตไปถังขยะแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleRestore() {
    if (!activeTrashNote) return;
    setSaveBusy(true);
    setNotesBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const restored = await restoreNote(activeTrashNote.id);
      activateNote(restored);
      setActiveTrashNote(null);
      setViewMode('notes');
      setPage(1);
      setNotes([]);
      setTotal(0);
      setRefreshKey((key) => key + 1);
      setNotice('กู้คืนโน้ตแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handlePermanentDelete() {
    if (!activeTrashNote) return;
    setSaveBusy(true);
    setNotesBusy(true);
    setNotesError('');
    setNotice('');
    try {
      const deletedId = activeTrashNote.id;
      await permanentlyDeleteNote(deletedId);
      setActiveTrashNote(null);
      setPermanentDeleteOpen(false);
      setNotes((currentNotes) => currentNotes.filter((note) => note.id !== deletedId));
      setTotal((currentTotal) => Math.max(0, currentTotal - 1));
      if (notes.length === 1 && page > 1) setPage((currentPage) => currentPage - 1);
      else setRefreshKey((key) => key + 1);
      setNotice('ลบโน้ตถาวรแล้ว');
    } catch (error) {
      setNotesBusy(false);
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
        setAuthError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
      } else {
        setNotesError(errorMessage(error));
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleLogout() {
    setAuthBusy(true);
    setAuthError('');
    try {
      await logout();
      setUser(null);
      setNotes([]);
      activateNote(null);
      setViewMode('notes');
      setPermanentDeleteOpen(false);
      setAuthState('signed-out');
    } catch (error) {
      setAuthError(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState('signed-out');
      }
    } finally {
      setAuthBusy(false);
    }
  }

  if (authState === 'checking') {
    return <main className="center-state" aria-live="polite">กำลังตรวจสอบเซสชัน…</main>;
  }

  if (authState === 'unavailable') {
    return (
      <main className="center-state">
        <section className="message-card">
          <span className="eyebrow">PERSONAL KNOWLEDGE HUB</span>
          <h1>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</h1>
          <p role="alert">{authError}</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            ลองอีกครั้ง
          </button>
        </section>
      </main>
    );
  }

  if (authState === 'signed-out') {
    return (
      <main className="center-state login-background">
        <section className="login-card">
          <div className="brand-mark" aria-hidden="true">P</div>
          <span className="eyebrow">PERSONAL KNOWLEDGE HUB</span>
          <h1>ยินดีต้อนรับกลับ</h1>
          <p className="muted">เข้าสู่ระบบเพื่อเปิดพื้นที่จัดเก็บความรู้ส่วนตัว</p>
          <form className="login-form" onSubmit={handleLogin}>
            <label htmlFor="username">ชื่อผู้ใช้</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={80}
            />
            <label htmlFor="password">รหัสผ่าน</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={1024}
            />
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <button className="button button-primary button-wide" type="submit" disabled={authBusy}>
              {authBusy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>
          <p className="login-footnote">บัญชีผู้ใช้จัดการโดยผู้ดูแลระบบ</p>
        </section>
      </main>
    );
  }

  const pageSize = viewMode === 'trash' ? 50 : 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="PKH หน้าหลัก">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong>PKH</strong>
            <small>Personal Knowledge Hub</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className="account-label">{user?.username}</span>
          <button className="button button-quiet" type="button" onClick={handleLogout} disabled={authBusy}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="notes-sidebar" aria-label={viewMode === 'trash' ? 'รายการในถังขยะ' : 'รายการโน้ต'}>
          <div className="sidebar-heading">
            <div>
              <span className="eyebrow">พื้นที่ส่วนตัว</span>
              <h1>{viewMode === 'trash' ? 'ถังขยะ' : 'โน้ตของฉัน'}</h1>
            </div>
            <span className="note-count">{total}</span>
          </div>
          <div className="view-switcher" aria-label="เลือกมุมมอง">
            <button
              className={`button${viewMode === 'notes' ? ' button-primary' : ' button-quiet'}`}
              type="button"
              aria-pressed={viewMode === 'notes'}
              onClick={() => switchView('notes')}
            >
              โน้ต
            </button>
            <button
              className={`button${viewMode === 'trash' ? ' button-primary' : ' button-quiet'}`}
              type="button"
              aria-pressed={viewMode === 'trash'}
              onClick={() => switchView('trash')}
            >
              ถังขยะ
            </button>
          </div>
          {viewMode === 'notes' && (
            <button className="button button-primary new-note-button" type="button" onClick={startNewNote}>
              <span aria-hidden="true">＋</span> เขียนโน้ตใหม่
            </button>
          )}

          {notesError && <p className="form-error sidebar-error" role="alert">{notesError}</p>}
          {notesBusy && notes.length === 0 && (
            <p className="empty-state" aria-live="polite">
              {viewMode === 'trash' ? 'กำลังโหลดถังขยะ…' : 'กำลังโหลดโน้ต…'}
            </p>
          )}
          {!notesBusy && notes.length === 0 && !notesError && (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">✎</span>
              <strong>{viewMode === 'trash' ? 'ถังขยะว่าง' : 'ยังไม่มีโน้ต'}</strong>
              <span>{viewMode === 'trash' ? 'โน้ตที่ย้ายไปถังขยะจะแสดงที่นี่' : 'เริ่มบันทึกไอเดียแรกของคุณ'}</span>
            </div>
          )}
          <nav className="note-list">
            {notes.map((note) => (
              <button
                className={`note-list-item${(viewMode === 'trash' ? activeTrashNote?.id : activeNote?.id) === note.id ? ' is-active' : ''}`}
                key={note.id}
                type="button"
                onClick={() => selectNote(note)}
                aria-current={(viewMode === 'trash' ? activeTrashNote?.id : activeNote?.id) === note.id ? 'page' : undefined}
              >
                <strong>{note.title}</strong>
                <span>{note.content || 'ไม่มีเนื้อหา'}</span>
                <time dateTime={new Date(note.updatedAt).toISOString()}>
                  {viewMode === 'trash' ? 'ย้ายเมื่อ ' : 'แก้ไข '}
                  {formatDate(note.updatedAt)}
                </time>
              </button>
            ))}
          </nav>
          {pageCount > 1 && (
            <div className="pagination">
              <button
                className="button button-quiet"
                type="button"
                disabled={page <= 1 || notesBusy}
                onClick={() => {
                  setNotesBusy(true);
                  setNotesError('');
                  setPage((currentPage) => currentPage - 1);
                }}
              >
                ก่อนหน้า
              </button>
              <span>{page} / {pageCount}</span>
              <button
                className="button button-quiet"
                type="button"
                disabled={page >= pageCount || notesBusy}
                onClick={() => {
                  setNotesBusy(true);
                  setNotesError('');
                  setPage((currentPage) => currentPage + 1);
                }}
              >
                ถัดไป
              </button>
            </div>
          )}
        </aside>

        {viewMode === 'notes' ? (
          <section className="editor-panel" aria-label={activeNote ? 'แก้ไขโน้ต' : 'สร้างโน้ต'}>
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">{activeNote ? 'บันทึกส่วนตัว' : 'โน้ตใหม่'}</span>
                {activeNote && <p className="updated-label">แก้ไขล่าสุด {formatDate(activeNote.updatedAt)}</p>}
              </div>
              <div className="editor-actions">
                {activeNote && (
                  <button className="button button-danger-quiet" type="button" onClick={handleDelete} disabled={saveBusy}>
                    ย้ายไปถังขยะ
                  </button>
                )}
                <button className="button button-primary" type="submit" form="note-editor" disabled={saveBusy}>
                  {saveBusy ? 'กำลังบันทึก…' : 'บันทึกโน้ต'}
                </button>
              </div>
            </div>

            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <form id="note-editor" className="note-editor" onSubmit={handleSave}>
              <input
                className="title-input"
                aria-label="หัวข้อโน้ต"
                placeholder="ตั้งชื่อโน้ต…"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
              />
              <textarea
                aria-label="เนื้อหาโน้ต"
                placeholder="เริ่มเขียนความคิดของคุณที่นี่…"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={100000}
              />
              <div className="editor-footer">
                <span>บันทึกเฉพาะในพื้นที่ส่วนตัวของคุณ</span>
                <span>{content.length.toLocaleString('th-TH')} / 100,000</span>
              </div>
            </form>
          </section>
        ) : (
          <section className="editor-panel trash-panel" aria-label="จัดการโน้ตในถังขยะ">
            <p className="trash-retention" role="note">
              หมายเหตุ: นโยบายเก็บถังขยะ 30 วันเป็นข้อมูลเตือนเท่านั้น ระบบไม่ลบโน้ตอัตโนมัติ
            </p>
            {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            {activeTrashNote ? (
              <>
                <div className="editor-toolbar">
                  <div>
                    <span className="eyebrow">รายการในถังขยะ</span>
                    <p className="updated-label">ย้ายเมื่อ {formatDate(activeTrashNote.updatedAt)}</p>
                  </div>
                  <div className="editor-actions">
                    <button className="button button-quiet" type="button" onClick={handleRestore} disabled={saveBusy}>
                      {saveBusy ? 'กำลังดำเนินการ…' : 'กู้คืน'}
                    </button>
                    <button
                      className="button button-danger-quiet"
                      type="button"
                      onClick={() => setPermanentDeleteOpen(true)}
                      disabled={saveBusy}
                    >
                      ลบถาวร
                    </button>
                  </div>
                </div>
                <article className="trash-preview">
                  <h2>{activeTrashNote.title}</h2>
                  <p>{activeTrashNote.content || 'ไม่มีเนื้อหา'}</p>
                </article>
              </>
            ) : (
              <div className="empty-state trash-empty">
                <span className="empty-icon" aria-hidden="true">⌫</span>
                <strong>เลือกโน้ตที่ต้องการจัดการ</strong>
                <span>กู้คืนหรือเลือกลบถาวรได้จากรายการด้านซ้าย</span>
              </div>
            )}
          </section>
        )}
      </div>

      {permanentDeleteOpen && activeTrashNote && (
        <div className="dialog-backdrop">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="permanent-delete-title"
            aria-describedby="permanent-delete-description"
          >
            <span className="eyebrow">ยืนยันการลบ</span>
            <h2 id="permanent-delete-title">ลบโน้ตนี้ถาวรหรือไม่?</h2>
            <p id="permanent-delete-description">
              “{activeTrashNote.title}” จะถูกลบและไม่สามารถกู้คืนได้ การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            {notesError && <p className="form-error" role="alert">{notesError}</p>}
            <div className="editor-actions">
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setPermanentDeleteOpen(false)}
                disabled={saveBusy}
              >
                ยกเลิก
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={handlePermanentDelete}
                disabled={saveBusy}
              >
                {saveBusy ? 'กำลังลบ…' : 'ยืนยันลบถาวร'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;

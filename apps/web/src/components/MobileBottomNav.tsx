import React, { useState } from 'react';
import type { NotesView } from '../types';

interface MobileBottomNavProps {
  viewMode: NotesView;
  onSwitchView: (view: NotesView) => void;
  onOpenMobileMenu: () => void;
  onQuickNewNote: () => void;
  inboxCount?: number;
  tasksCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  viewMode,
  onSwitchView,
  onOpenMobileMenu,
  onQuickNewNote,
  inboxCount = 0,
  tasksCount = 0,
}) => {
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button (+ FAB) */}
      <div className="mobile-fab-container">
        {fabOpen && (
          <div className="mobile-fab-menu">
            <button
              className="fab-item"
              type="button"
              onClick={() => {
                setFabOpen(false);
                onQuickNewNote();
              }}
            >
              <span className="fab-item-icon">📝</span>
              <span className="fab-item-label">โน้ตใหม่</span>
            </button>
            <button
              className="fab-item"
              type="button"
              onClick={() => {
                setFabOpen(false);
                onSwitchView('inbox');
              }}
            >
              <span className="fab-item-icon">📥</span>
              <span className="fab-item-label">จดลง Inbox</span>
            </button>
            <button
              className="fab-item"
              type="button"
              onClick={() => {
                setFabOpen(false);
                onSwitchView('tasks');
              }}
            >
              <span className="fab-item-icon">✅</span>
              <span className="fab-item-label">เพิ่มงาน</span>
            </button>
          </div>
        )}

        <button
          className={`mobile-fab-button${fabOpen ? ' is-active' : ''}`}
          type="button"
          aria-label="สร้างรายการใหม่ด่วน"
          onClick={() => setFabOpen((open) => !open)}
        >
          {fabOpen ? '✕' : '＋'}
        </button>
      </div>

      {/* 5-Item Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="แถบนำทางด่วนบนมือถือ">
        <button
          type="button"
          className={`bottom-nav-item${viewMode === 'home' ? ' is-active' : ''}`}
          onClick={() => onSwitchView('home')}
        >
          <span className="bottom-nav-icon">📊</span>
          <span className="bottom-nav-label">วันนี้</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item${viewMode === 'notes' ? ' is-active' : ''}`}
          onClick={() => onSwitchView('notes')}
        >
          <span className="bottom-nav-icon">📝</span>
          <span className="bottom-nav-label">โน้ต</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item${viewMode === 'inbox' ? ' is-active' : ''}`}
          onClick={() => onSwitchView('inbox')}
        >
          <span className="bottom-nav-icon">
            📥
            {inboxCount > 0 && <span className="bottom-nav-badge">{inboxCount}</span>}
          </span>
          <span className="bottom-nav-label">กล่องเข้า</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item${viewMode === 'tasks' ? ' is-active' : ''}`}
          onClick={() => onSwitchView('tasks')}
        >
          <span className="bottom-nav-icon">
            ✅
            {tasksCount > 0 && <span className="bottom-nav-badge">{tasksCount}</span>}
          </span>
          <span className="bottom-nav-label">งาน</span>
        </button>

        <button
          type="button"
          className="bottom-nav-item"
          onClick={onOpenMobileMenu}
        >
          <span className="bottom-nav-icon">☰</span>
          <span className="bottom-nav-label">เมนู</span>
        </button>
      </nav>
    </>
  );
};

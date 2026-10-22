import React from 'react';
import type { CustomCategory } from '../../api';

export interface CategoryModalState {
  mode: 'create' | 'edit';
  categoryId?: string;
  parentId?: string | null;
}

export interface CategoryDraft {
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
}

export interface CategoryModalProps {
  modalState: CategoryModalState | null;
  onClose: () => void;
  draft: CategoryDraft;
  setDraft: React.Dispatch<React.SetStateAction<CategoryDraft>>;
  customCategories: CustomCategory[];
  isBusy: boolean;
  error: string;
  onSave: () => Promise<void>;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  modalState,
  onClose,
  draft,
  setDraft,
  customCategories,
  isBusy,
  error,
  onSave,
}) => {
  React.useEffect(() => {
    if (!modalState) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState, isBusy, onClose]);

  if (!modalState) return null;

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          if (draft.name.trim()) {
            if (window.confirm('คุณต้องการปิดโดยไม่บันทึกหมวดหมู่นี้หรือไม่?')) {
              onClose();
            }
          } else {
            onClose();
          }
        }
      }}
    >
      <section
        className="dialog"
        style={{ maxWidth: '460px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
      >
        <div className="dialog-head">
          <div>
            <span className="eyebrow">หมวดหมู่และหัวข้อ</span>
            <h2 id="category-modal-title">
              {modalState.mode === 'create'
                ? (modalState.parentId ? '➕ สร้างหมวดหมู่ย่อย' : '📁 สร้างหมวดหมู่ใหม่')
                : '✎ แก้ไขหมวดหมู่'}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิด"
            disabled={isBusy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); void onSave(); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          <label>
            ชื่อหมวดหมู่
            <input
              required
              type="text"
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="เช่น การเงิน & การลงทุน, งานวิจัย, สูตรอาหาร..."
              autoFocus
            />
          </label>

          <label>
            ไอคอน / Emoji
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                maxLength={8}
                style={{ width: '64px', textAlign: 'center', fontSize: '18px' }}
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              />
              <div className="emoji-preset-bar">
                {['📁', '💼', '💰', '🎯', '🚀', '💡', '📚', '🩺', '🏠', '🌿', '🎨', '⚙️', '⭐'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="emoji-preset-btn"
                    onClick={() => setDraft({ ...draft, icon: emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </label>

          <label>
            สีประจำหมวดหมู่
            <div className="color-preset-bar">
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                style={{ width: '32px', height: '32px', padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer' }}
              />
              {['#3f7658', '#4f5fa8', '#a85a72', '#a8742c', '#6b4f9e', '#0284c7', '#059669', '#dc2626'].map((col) => (
                <button
                  key={col}
                  type="button"
                  className={`color-preset-btn${draft.color === col ? ' is-active' : ''}`}
                  style={{ backgroundColor: col }}
                  onClick={() => setDraft({ ...draft, color: col })}
                  title={col}
                />
              ))}
            </div>
          </label>

          {customCategories.length > 0 && modalState.mode === 'create' && (
            <label>
              หมวดหมู่หลัก (ถ้าต้องการสร้างเป็นหมวดย่อย)
              <select
                value={draft.parentId ?? ''}
                onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}
              >
                <option value="">ไม่มี (หมวดหมู่ระดับบนสุด)</option>
                {customCategories.filter((c) => !c.parentId).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="editor-actions" style={{ marginTop: '8px' }}>
            <button
              className="button button-quiet"
              type="button"
              disabled={isBusy}
              onClick={onClose}
            >
              ยกเลิก
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={isBusy}
            >
              {isBusy ? 'กำลังบันทึก…' : 'บันทึกหมวดหมู่'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

import React from 'react';
import type { Note } from '../../api';

export interface PermanentDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note | null;
  onConfirm: () => void;
  isBusy: boolean;
  error?: string;
}

export const PermanentDeleteModal: React.FC<PermanentDeleteModalProps> = ({
  isOpen,
  onClose,
  note,
  onConfirm,
  isBusy,
  error,
}) => {
  if (!isOpen || !note) return null;

  return (
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
          “{note.title}” จะถูกลบและไม่สามารถกู้คืนได้ การดำเนินการนี้ไม่สามารถย้อนกลับได้
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button
            className="button button-quiet"
            type="button"
            onClick={onClose}
            disabled={isBusy}
          >
            ยกเลิก
          </button>
          <button
            className="button button-danger"
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? 'กำลังลบ…' : 'ยืนยันลบถาวร'}
          </button>
        </div>
      </section>
    </div>
  );
};

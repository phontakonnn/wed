import React, { useEffect, useState } from 'react';
import { listNoteVersions, restoreNoteVersion, type Note, type NoteVersion } from '../../api';
import { formatDate } from '../../lib/formatters';
import { MarkdownViewer } from '../../components/MarkdownViewer';
import { Button } from '../../components/ui/Button';

interface NoteVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  onRestored: (restoredNote: Note) => void;
}

export const NoteVersionHistoryModal: React.FC<NoteVersionHistoryModalProps> = ({
  isOpen,
  onClose,
  note,
  onRestored,
}) => {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    listNoteVersions(note.id)
      .then((data) => {
        if (!isMounted) return;
        setVersions(data);
        if (data.length > 0) {
          setSelectedVersion(data[0]);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดประวัติเวอร์ชันได้');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [note.id]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const handleRestore = async (version: NoteVersion) => {
    try {
      setRestoring(true);
      setError(null);
      const restored = await restoreNoteVersion(note.id, version.id);
      onRestored(restored);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการกู้คืนเวอร์ชัน');
    } finally {
      setRestoring(false);
      setConfirmRestoreId(null);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="version-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-overlay, #ffffff)',
          border: '1px solid var(--border-subtle, #e5e7eb)',
          borderRadius: 'var(--radius-lg, 12px)',
          width: '90vw',
          maxWidth: '900px',
          height: '80vh',
          maxHeight: '700px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1))',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-subtle, #f9fafb)',
          }}
        >
          <div>
            <h2
              id="version-history-title"
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'var(--text-primary, #111827)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🕒</span> ประวัติการแก้ไข (Revision History)
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-secondary, #6b7280)',
              }}
            >
              โน้ต: <strong>{note.title}</strong>
            </p>
          </div>
          <Button variant="quiet" size="sm" onClick={onClose} aria-label="ปิด">
            ✕
          </Button>
        </div>

        {/* Content Body */}
        {error && (
          <div
            style={{
              padding: '10px 20px',
              background: 'var(--color-danger-subtle, #fee2e2)',
              color: 'var(--color-danger, #b91c1c)',
              fontSize: '0.875rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary, #6b7280)',
            }}
          >
            ⏳ กำลังโหลดประวัติการแก้ไข...
          </div>
        ) : versions.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text-secondary, #6b7280)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📝</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary, #111827)' }}>
              ยังไม่มีประวัติการแก้ไขก่อนหน้า
            </h3>
            <p style={{ margin: 0, maxWidth: '400px', fontSize: '0.9rem' }}>
              ระบบจะบันทึกประวัติเวอร์ชันย้อนหลังโดยอัตโนมัติเมื่อคุณแก้ไขและบันทึกโน้ตนี้ในครั้งถัดไป
            </p>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {/* Version List Sidebar */}
            <div
              style={{
                width: '320px',
                borderRight: '1px solid var(--border-subtle, #e5e7eb)',
                overflowY: 'auto',
                background: 'var(--surface-base, #ffffff)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-tertiary, #9ca3af)',
                  borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
                }}
              >
                รายการเวอร์ชัน ({versions.length})
              </div>
              <div style={{ flex: 1, padding: '8px' }}>
                {versions.map((ver) => {
                  const isSelected = selectedVersion?.id === ver.id;
                  const charDiff = ver.content.length - note.content.length;
                  return (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => {
                        setSelectedVersion(ver);
                        setConfirmRestoreId(null);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        marginBottom: '4px',
                        borderRadius: 'var(--radius-md, 8px)',
                        border: isSelected
                          ? '1px solid var(--color-primary, #3f7658)'
                          : '1px solid transparent',
                        background: isSelected
                          ? 'var(--color-primary-subtle, #ecfdf5)'
                          : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: isSelected
                              ? 'var(--color-primary, #3f7658)'
                              : 'var(--text-primary, #111827)',
                          }}
                        >
                          เวอร์ชัน #{ver.versionNumber}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color:
                              charDiff > 0
                                ? '#059669'
                                : charDiff < 0
                                ? '#dc2626'
                                : 'var(--text-tertiary, #9ca3af)',
                          }}
                        >
                          {charDiff > 0 ? `+${charDiff}` : charDiff} ตัวอักษร
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary, #4b5563)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginBottom: '2px',
                        }}
                      >
                        {ver.title || 'ไม่มีชื่อ'}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary, #9ca3af)',
                        }}
                      >
                        {formatDate(ver.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Version Preview Pane */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--surface-subtle, #f9fafb)',
              }}
            >
              {selectedVersion ? (
                <>
                  <div
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--surface-base, #ffffff)',
                    }}
                  >
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary, #111827)' }}>
                        {selectedVersion.title}
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #9ca3af)', marginTop: '2px' }}>
                        บันทึกเมื่อ: {formatDate(selectedVersion.createdAt)} (เวอร์ชัน #{selectedVersion.versionNumber})
                      </div>
                    </div>
                    <div>
                      {confirmRestoreId === selectedVersion.id ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-danger, #b91c1c)' }}>
                            กู้คืนเวอร์ชันนี้?
                          </span>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={restoring}
                            onClick={() => void handleRestore(selectedVersion)}
                          >
                            {restoring ? 'กำลังกู้คืน...' : 'ยืนยัน'}
                          </Button>
                          <Button
                            variant="quiet"
                            size="sm"
                            disabled={restoring}
                            onClick={() => setConfirmRestoreId(null)}
                          >
                            ยกเลิก
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={restoring}
                          onClick={() => setConfirmRestoreId(selectedVersion.id)}
                        >
                          🔄 กู้คืนเวอร์ชันนี้
                        </Button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: '20px',
                      background: 'var(--surface-base, #ffffff)',
                    }}
                  >
                    <MarkdownViewer content={selectedVersion.content} />
                  </div>
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary, #6b7280)',
                  }}
                >
                  เลือกเวอร์ชันจากรายการด้านซ้ายเพื่อดูตัวอย่าง
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle, #e5e7eb)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-subtle, #f9fafb)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary, #6b7280)',
          }}
        >
          <span>
            💡 เมื่อกู้คืนเวอร์ชันเก่า ระบบจะบันทึกสถานะปัจจุบันเป็นเวอร์ชันใหม่ให้อัตโนมัติ จึงไม่มีข้อมูลสูญหาย
          </span>
          <Button variant="quiet" size="sm" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  );
};

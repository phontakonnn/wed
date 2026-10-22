import React, { useState, useEffect } from 'react';
import type { TaxonomyItem } from '../api';
import { listTags, saveTaxonomyItem, deleteTaxonomyItem } from '../api';
import { Button } from './ui/Button';

export interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag?: (tag: TaxonomyItem) => void;
  onTagsUpdated?: () => void;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#6366f1', // Indigo
  '#64748b', // Slate
];

export const TagManagerModal: React.FC<TagManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectTag,
  onTagsUpdated,
}) => {
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Creation / Editing form state
  const [editingTag, setEditingTag] = useState<TaxonomyItem | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3b82f6');

  // Confirmation state for deleting in-use tag
  const [tagToDelete, setTagToDelete] = useState<TaxonomyItem | null>(null);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await listTags(1, 200);
      setTags(res.tags || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingTag(null);
    setTagName('');
    setTagColor('#3b82f6');
    setError('');
    setNotice('');
    setTagToDelete(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      void listTags(1, 200).then((res) => {
        if (!ignore) setTags(res.tags || []);
      }).catch(() => undefined);
    }
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (tagToDelete) {
          setTagToDelete(null);
        } else if (editingTag) {
          setEditingTag(null);
          setTagName('');
          setTagColor('#3b82f6');
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingTag, tagToDelete, onClose]);

  if (!isOpen) return null;

  const handleStartEdit = (tag: TaxonomyItem) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color || '#3b82f6');
    setError('');
    setNotice('');
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setTagName('');
    setTagColor('#3b82f6');
    setError('');
  };

  const handleSaveTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tagName.trim().replace(/^#+/, '');
    if (!cleanName) {
      setError('กรุณาระบุชื่อแท็ก');
      return;
    }

    // Check duplicate
    const duplicate = tags.find(
      (t) => t.name.toLowerCase() === cleanName.toLowerCase() && t.id !== editingTag?.id,
    );
    if (duplicate) {
      setError(`มีแท็กชื่อ "${cleanName}" อยู่แล้ว`);
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (editingTag) {
        await saveTaxonomyItem('tags', editingTag.id, cleanName, tagColor);
        setNotice(`แก้ไขแท็ก "${cleanName}" สำเร็จ`);
      } else {
        await saveTaxonomyItem('tags', null, cleanName, tagColor);
        setNotice(`สร้างแท็ก "${cleanName}" สำเร็จ`);
      }
      setTagName('');
      setTagColor('#3b82f6');
      setEditingTag(null);
      await fetchTags();
      onTagsUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกแท็ก');
    } finally {
      setBusy(false);
    }
  };

  const handleClickDelete = (tag: TaxonomyItem) => {
    const noteCount = tag.noteCount ?? 0;
    const personCount = tag.personCount ?? 0;
    if (noteCount > 0 || personCount > 0) {
      setTagToDelete(tag);
    } else {
      if (window.confirm(`ยืนยันการลบแท็ก "${tag.name}" หรือไม่?`)) {
        void executeDeleteTag(tag.id);
      }
    }
  };

  const executeDeleteTag = async (tagId: string) => {
    setBusy(true);
    setError('');
    try {
      await deleteTaxonomyItem('tags', tagId);
      setNotice('ลบแท็กเรียบร้อยแล้ว');
      setTagToDelete(null);
      if (editingTag?.id === tagId) {
        handleCancelEdit();
      }
      await fetchTags();
      onTagsUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบแท็ก');
    } finally {
      setBusy(false);
    }
  };

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) handleClose();
      }}
    >
      <section
        className="dialog"
        style={{ maxWidth: '560px', width: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-manager-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🏷️</span>
            <div>
              <h2 id="tag-manager-title" style={{ margin: 0, fontSize: '18px' }}>
                จัดการแท็ก (Tags Management)
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                {tags.length} แท็กทั้งหมดในระบบ
              </span>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ปิด"
            disabled={busy}
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        {notice && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
            ✓ {notice}
          </div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: '8px', fontSize: '13px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Delete Confirmation Warning for in-use tags */}
        {tagToDelete && (
          <div
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <strong style={{ color: '#be123c', fontSize: '14px' }}>
              ⚠️ แท็กนี้กำลังถูกใช้งานอยู่ในระบบ
            </strong>
            <p style={{ margin: 0, fontSize: '13px', color: '#881337', lineHeight: 1.5 }}>
              แท็ก <strong>“{tagToDelete.name}”</strong> กำลังถูกใช้งานอยู่ใน{' '}
              <strong>{tagToDelete.noteCount ?? 0} โน้ต</strong> และ{' '}
              <strong>{tagToDelete.personCount ?? 0} บุคคลสำคัญ</strong>
              <br />
              หากลบ การเชื่อมโยงแท็กนี้กับโน้ตและบุคคลจะถูกยกเลิก คุณต้องการลบจริงหรือไม่?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <Button
                variant="quiet"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => setTagToDelete(null)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => void executeDeleteTag(tagToDelete.id)}
              >
                {busy ? 'กำลังลบ…' : 'ยืนยันลบแท็กนี้'}
              </Button>
            </div>
          </div>
        )}

        {/* Form: Add or Edit Tag */}
        <form
          onSubmit={handleSaveTag}
          style={{
            background: 'var(--pkh-bg-subtle, #f8fafc)',
            padding: '14px',
            borderRadius: '12px',
            border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
              {editingTag ? `✎ แก้ไขแท็ก "${editingTag.name}"` : '➕ สร้างแท็กใหม่'}
            </strong>
            {editingTag && (
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '12px',
                  color: 'var(--pkh-text-muted)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                ยกเลิกการแก้ไข
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ชื่อแท็ก เช่น งานด่วน, สุขภาพ, ไอเดีย..."
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              disabled={busy}
              maxLength={60}
              style={{
                flex: 1,
                fontSize: '13px',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface, #fff)',
              }}
            />
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={busy || !tagName.trim()}
            >
              {busy ? 'กำลังบันทึก…' : editingTag ? 'บันทึกการแก้ไข' : '+ เพิ่มแท็ก'}
            </Button>
          </div>

          {/* Color Picker Palette */}
          <div>
            <span style={{ fontSize: '12px', color: 'var(--pkh-text-secondary)', display: 'block', marginBottom: '6px' }}>
              เลือกสีประจำแท็ก:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESET_COLORS.map((color) => {
                const isSelected = tagColor.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setTagColor(color)}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: color,
                      border: isSelected ? '2px solid #000' : '2px solid transparent',
                      boxShadow: isSelected ? '0 0 0 2px #fff, 0 0 0 4px ' + color : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    title={color}
                  >
                    {isSelected && '✓'}
                  </button>
                );
              })}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: 'var(--pkh-text-muted)',
                  marginLeft: '4px',
                }}
              >
                <span>สีอื่น:</span>
                <input
                  type="color"
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  style={{
                    width: '28px',
                    height: '26px',
                    padding: 0,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                />
              </label>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: `${tagColor}18`,
                  border: `1px solid ${tagColor}40`,
                  color: tagColor,
                  fontSize: '12px',
                  fontWeight: 600,
                  marginLeft: 'auto',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tagColor }} />
                #{tagName.trim() || 'ตัวอย่างแท็ก'}
              </div>
            </div>
          </div>
        </form>

        {/* Search and Tag List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <input
            type="search"
            placeholder="🔍 ค้นหาแท็ก..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              fontSize: '13px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--pkh-border-default)',
              background: 'var(--pkh-bg-surface, #fff)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />

          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '4px 0',
            }}
          >
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--pkh-text-muted)', fontSize: '13px' }}>
                กำลังโหลดแท็ก…
              </p>
            ) : filteredTags.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--pkh-text-muted)', fontSize: '13px', padding: '16px 0' }}>
                {searchQuery ? 'ไม่พบแท็กที่ตรงกับคำค้น' : 'ยังไม่มีแท็กในระบบ'}
              </p>
            ) : (
              filteredTags.map((tag) => {
                const color = tag.color || '#3b82f6';
                return (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                      background: 'var(--pkh-bg-surface, #fff)',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, cursor: onSelectTag ? 'pointer' : 'default' }}
                      onClick={() => onSelectTag?.(tag)}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: `${color}18`,
                          border: `1px solid ${color}40`,
                          color,
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                        #{tag.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                        ({tag.noteCount ?? 0} โน้ต · {tag.personCount ?? 0} บุคคล)
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {onSelectTag && (
                        <button
                          type="button"
                          className="button button-quiet"
                          style={{ fontSize: '11px', padding: '2px 6px' }}
                          onClick={() => onSelectTag(tag)}
                        >
                          เลือก
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        style={{ fontSize: '13px', padding: '2px 6px', width: '28px', height: '28px' }}
                        title="แก้ไขแท็ก"
                        onClick={() => handleStartEdit(tag)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        style={{ fontSize: '13px', padding: '2px 6px', width: '28px', height: '28px', color: '#ef4444' }}
                        title="ลบแท็ก"
                        onClick={() => handleClickDelete(tag)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
          <Button variant="quiet" type="button" onClick={handleClose}>
            ปิดหน้าต่าง
          </Button>
        </div>
      </section>
    </div>
  );
};

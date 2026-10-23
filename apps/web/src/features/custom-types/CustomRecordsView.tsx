import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { sanitizeHref } from '../../lib/safeUrl';
import {
  type CustomDataType,
  type CustomDataRecord,
  type CustomFieldSchema,
  fetchCustomRecords,
  createCustomRecord,
  updateCustomRecord,
  deleteCustomRecord,
  deleteCustomType,
  addFavorite,
  removeFavorite,
} from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { CustomTypeBuilderModal } from './CustomTypeBuilderModal';

interface CustomRecordsViewProps {
  customType: CustomDataType;
  onTypeUpdated: (updatedType: CustomDataType) => void;
  onTypeDeleted: (deletedTypeId: string) => void;
  onBackToHome?: () => void;
}

export const CustomRecordsView: React.FC<CustomRecordsViewProps> = ({
  customType,
  onTypeUpdated,
  onTypeDeleted,
}) => {
  const [records, setRecords] = useState<CustomDataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');

  // Record modal (create / edit)
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CustomDataRecord | null>(null);
  const [recordTitle, setRecordTitle] = useState('');
  const [recordData, setRecordData] = useState<Record<string, unknown>>({});
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Schema builder modal
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<CustomDataRecord | null>(null);
  const [deleteTypeModalOpen, setDeleteTypeModalOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCustomRecords(customType.id, {
        search: searchQuery.trim() || undefined,
        pageSize: 150,
      });
      setRecords(res.records || []);
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้',
      });
    } finally {
      setLoading(false);
    }
  }, [customType.id, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRecords();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadRecords]);

  // Open record modal for create
  const handleOpenCreateRecord = () => {
    setEditingRecord(null);
    setRecordTitle('');
    const defaultData: Record<string, unknown> = {};
    for (const field of customType.fields) {
      if (field.defaultValue !== undefined) {
        defaultData[field.id] = field.defaultValue;
      } else if (field.type === 'checkbox') {
        defaultData[field.id] = false;
      } else {
        defaultData[field.id] = '';
      }
    }
    setRecordData(defaultData);
    setRecordError(null);
    setRecordModalOpen(true);
  };

  // Open record modal for edit
  const handleOpenEditRecord = (record: CustomDataRecord) => {
    setEditingRecord(record);
    setRecordTitle(record.title || '');
    setRecordData({ ...(record.data || {}) });
    setRecordError(null);
    setRecordModalOpen(true);
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordTitle.trim()) {
      setRecordError('กรุณากรอกหัวข้อรายการ');
      return;
    }

    // Validate required fields
    for (const field of customType.fields) {
      if (field.required) {
        const val = recordData[field.id];
        if (val === undefined || val === null || val === '') {
          setRecordError(`กรุณากรอกฟิลด์ "${field.name}"`);
          return;
        }
      }
    }

    setRecordBusy(true);
    setRecordError(null);
    try {
      if (editingRecord) {
        await updateCustomRecord(editingRecord.id, {
          title: recordTitle.trim(),
          data: recordData,
        });
        setNotice({ type: 'success', message: 'แก้ไขข้อมูลเรียบร้อยแล้ว' });
      } else {
        await createCustomRecord(customType.id, {
          title: recordTitle.trim(),
          data: recordData,
        });
        setNotice({ type: 'success', message: 'เพิ่มข้อมูลใหม่เรียบร้อยแล้ว' });
      }
      setRecordModalOpen(false);
      await loadRecords();
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setRecordBusy(false);
    }
  };

  const handleToggleFavorite = async (record: CustomDataRecord) => {
    const nextFav = !record.isFavorite;
    try {
      if (nextFav) {
        await addFavorite('custom_record', record.id);
      } else {
        await removeFavorite('custom_record', record.id);
      }
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, isFavorite: nextFav } : r))
      );
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนสถานะรายการโปรดได้',
      });
    }
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    setDeleteBusy(true);
    try {
      await deleteCustomRecord(recordToDelete.id);
      setNotice({ type: 'success', message: `ย้าย "${recordToDelete.title}" ลงถังขยะเรียบร้อย` });
      setDeleteModalOpen(false);
      setRecordToDelete(null);
      await loadRecords();
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถลบข้อมูลได้',
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteType = async () => {
    setDeleteBusy(true);
    try {
      await deleteCustomType(customType.id);
      setDeleteTypeModalOpen(false);
      onTypeDeleted(customType.id);
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถลบประเภทข้อมูลได้',
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  // Sorted records
  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      if (sortOrder === 'newest') return b.createdAt - a.createdAt;
      if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [records, sortOrder]);

  return (
    <section className="life-view-container" aria-label={`จัดการข้อมูล ${customType.name}`}>
      {/* Module Header Banner */}
      <div className="module-header-banner" style={{ borderLeft: `5px solid ${customType.color || 'var(--pkh-primary)'}` }}>
        <div className="banner-icon" style={{ fontSize: '32px' }}>
          {customType.icon || '🧩'}
        </div>
        <div className="banner-info">
          <span className="eyebrow" style={{ color: customType.color }}>
            Custom Data Type · {customType.category}
          </span>
          <h2 className="banner-title">{customType.name}</h2>
          <p className="banner-subtitle">
            {customType.description || `จัดการข้อมูลในหมวด ${customType.name}`} ({records.length} รายการ)
          </p>
        </div>
        <div className="banner-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleOpenCreateRecord}>
            ＋ เพิ่มข้อมูลใหม่
          </Button>
          <Button variant="quiet" onClick={() => setSchemaModalOpen(true)}>
            🛠️ แก้ไขประเภท &amp; ฟิลด์
          </Button>
          <Button variant="danger-quiet" onClick={() => setDeleteTypeModalOpen(true)}>
            ลบประเภทนี้
          </Button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: notice.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: notice.type === 'success' ? '#16a34a' : '#dc2626',
            border: `1px solid ${notice.type === 'success' ? '#22c55e' : '#ef4444'}`,
          }}
        >
          <span>{notice.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{notice.message}</span>
          <button
            onClick={() => setNotice(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Control Bar: Search, View Mode, Sort */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <Input
            type="text"
            placeholder="🔍 ค้นหาข้อมูลในหน้านี้..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', border: '1px solid var(--pkh-border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              style={{
                padding: '6px 12px',
                background: viewMode === 'card' ? 'var(--pkh-primary)' : 'var(--pkh-bg-surface)',
                color: viewMode === 'card' ? '#ffffff' : 'var(--pkh-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ▦ การ์ด
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 12px',
                background: viewMode === 'table' ? 'var(--pkh-primary)' : 'var(--pkh-bg-surface)',
                color: viewMode === 'table' ? '#ffffff' : 'var(--pkh-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ☷ ตาราง
            </button>
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'title')}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--pkh-border-subtle)',
              backgroundColor: 'var(--pkh-bg-surface)',
              color: 'var(--pkh-text-primary)',
              fontSize: '12px',
            }}
          >
            <option value="newest">ใหม่สุดก่อน</option>
            <option value="oldest">เก่าสุดก่อน</option>
            <option value="title">ตามชื่อ (ก-ฮ)</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
          กำลังโหลดข้อมูล...
        </div>
      ) : sortedRecords.length === 0 ? (
        <EmptyState
          icon={customType.icon || '🧩'}
          title={`ยังไม่มีข้อมูลใน ${customType.name}`}
          description="กดปุ่ม '+ เพิ่มข้อมูลใหม่' เพื่อเริ่มบันทึกข้อมูลตามโครงสร้างที่คุณออกแบบ"
        />
      ) : viewMode === 'card' ? (
        <div className="life-bento-grid">
          {sortedRecords.map((record) => (
            <article key={record.id} className="life-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--pkh-text-primary)', wordBreak: 'break-word' }}>
                    {record.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleToggleFavorite(record)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      color: record.isFavorite ? '#f59e0b' : 'var(--pkh-text-muted)',
                      padding: '2px',
                    }}
                    title={record.isFavorite ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}
                  >
                    {record.isFavorite ? '★' : '☆'}
                  </button>
                </div>

                {/* Dynamic fields display */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '10px 0', fontSize: '13px' }}>
                  {customType.fields.map((field) => {
                    const val = (record.data || {})[field.id];
                    if (val === undefined || val === null || val === '') return null;
                    return (
                      <div key={field.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: 1.4 }}>
                        <strong style={{ color: 'var(--pkh-text-muted)', minWidth: '70px', fontSize: '12px' }}>
                          {field.name}:
                        </strong>
                        <span style={{ color: 'var(--pkh-text-secondary)', flex: 1, wordBreak: 'break-word' }}>
                          {field.type === 'checkbox' ? (
                            val ? '✓ ใช่' : '✕ ไม่ใช่'
                          ) : field.type === 'url' ? (
                            <a href={sanitizeHref(String(val))} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pkh-primary)' }}>
                              {String(val)}
                            </a>
                          ) : (
                            String(val)
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '10px',
                  marginTop: '12px',
                  borderTop: '1px solid var(--pkh-border-subtle)',
                  fontSize: '11px',
                  color: 'var(--pkh-text-muted)',
                }}
              >
                <time>{formatDate(record.createdAt)}</time>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    variant="quiet"
                    size="sm"
                    style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                    onClick={() => handleOpenEditRecord(record)}
                  >
                    ✎ แก้ไข
                  </Button>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                    onClick={() => {
                      setRecordToDelete(record);
                      setDeleteModalOpen(true);
                    }}
                  >
                    🗑️ ลบ
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        /* Table View */
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--pkh-bg-surface)', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))', borderBottom: '1px solid var(--pkh-border-subtle)' }}>
                <th style={{ padding: '10px 12px', width: '36px' }}>⭐</th>
                <th style={{ padding: '10px 12px' }}>หัวข้อ</th>
                {customType.fields.map((f) => (
                  <th key={f.id} style={{ padding: '10px 12px' }}>
                    {f.name}
                  </th>
                ))}
                <th style={{ padding: '10px 12px', width: '120px' }}>วันที่</th>
                <th style={{ padding: '10px 12px', width: '110px', textAlign: 'right' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid var(--pkh-border-subtle)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      type="button"
                      onClick={() => void handleToggleFavorite(record)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '15px',
                        color: record.isFavorite ? '#f59e0b' : 'var(--pkh-text-muted)',
                      }}
                    >
                      {record.isFavorite ? '★' : '☆'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                    {record.title}
                  </td>
                  {customType.fields.map((field) => {
                    const val = (record.data || {})[field.id];
                    return (
                      <td key={field.id} style={{ padding: '8px 12px', color: 'var(--pkh-text-secondary)' }}>
                        {val === undefined || val === null || val === '' ? (
                          <span style={{ color: 'var(--pkh-text-muted)' }}>-</span>
                        ) : field.type === 'checkbox' ? (
                          val ? '✓' : '✕'
                        ) : field.type === 'url' ? (
                          <a href={sanitizeHref(String(val))} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pkh-primary)' }}>
                            ลิงก์ ↗
                          </a>
                        ) : (
                          String(val)
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px 12px', color: 'var(--pkh-text-muted)', fontSize: '11px' }}>
                    {formatDate(record.createdAt)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditRecord(record)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pkh-primary)' }}
                        title="แก้ไข"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecordToDelete(record);
                          setDeleteModalOpen(true);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        title="ลบ"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dynamic Record Modal (Create / Edit) */}
      <Modal
        isOpen={recordModalOpen}
        onClose={() => {
          if (!recordBusy) setRecordModalOpen(false);
        }}
        title={editingRecord ? `✎ แก้ไขข้อมูล ${customType.name}` : `＋ เพิ่มข้อมูลใน ${customType.name}`}
      >
        <form onSubmit={handleSaveRecord} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
          {recordError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                fontSize: '13px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              ⚠️ {recordError}
            </div>
          )}

          {/* Record Title */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
              หัวข้อ / ชื่อรายการ <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              type="text"
              value={recordTitle}
              onChange={(e) => setRecordTitle(e.target.value)}
              placeholder="ระบุชื่อหรือหัวข้อรายการนี้"
              required
            />
          </div>

          {/* Dynamic Fields from Schema */}
          {customType.fields.map((field) => (
            <DynamicFieldInput
              key={field.id}
              field={field}
              value={recordData[field.id]}
              onChange={(newVal) =>
                setRecordData((prev) => ({ ...prev, [field.id]: newVal }))
              }
            />
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px' }}>
            <Button
              type="button"
              variant="quiet"
              onClick={() => setRecordModalOpen(false)}
              disabled={recordBusy}
            >
              ยกเลิก
            </Button>
            <Button type="submit" variant="primary" disabled={recordBusy}>
              {recordBusy ? 'กำลังบันทึก…' : editingRecord ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Record Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteModalOpen(false);
        }}
        title="🗑️ ยืนยันการลบข้อมูล"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--pkh-text-primary)' }}>
            คุณต้องการย้ายรายการ "{recordToDelete?.title}" ลงถังขยะใช่หรือไม่? (สามารถกู้คืนได้จากถังขยะกลางตลอดเวลา)
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              variant="quiet"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteBusy}
            >
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={handleDeleteRecord} disabled={deleteBusy}>
              {deleteBusy ? 'กำลังลบ…' : 'ย้ายลงถังขยะ'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Entire Custom Type Modal */}
      <Modal
        isOpen={deleteTypeModalOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteTypeModalOpen(false);
        }}
        title="⚠️ ยืนยันการลบประเภทข้อมูล"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              fontSize: '13px',
              lineHeight: 1.5,
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <strong>คำเตือน:</strong> การลบประเภทข้อมูล "{customType.name}" จะนำเมนูนี้ออกจาก Sidebar ข้อมูลภายในจะถูกย้ายลงถังขยะ
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--pkh-text-primary)' }}>
            คุณต้องการดำเนินการต่อหรือไม่?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button
              variant="quiet"
              onClick={() => setDeleteTypeModalOpen(false)}
              disabled={deleteBusy}
            >
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={handleDeleteType} disabled={deleteBusy}>
              {deleteBusy ? 'กำลังลบ…' : 'ยืนยันลบประเภทนี้'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Custom Type Builder / Editor Modal. Mounted on demand so its form
          state is initialised from typeToEdit on every open. */}
      {schemaModalOpen && (
      <CustomTypeBuilderModal
        isOpen={schemaModalOpen}
        onClose={() => setSchemaModalOpen(false)}
        typeToEdit={customType}
        onSaved={(updated) => {
          onTypeUpdated(updated);
          setNotice({ type: 'success', message: 'แก้ไขโครงสร้างประเภทข้อมูลเรียบร้อยแล้ว' });
        }}
      />
      )}
    </section>
  );
};

// Component to dynamically render appropriate form control based on field schema
const DynamicFieldInput: React.FC<{
  field: CustomFieldSchema;
  value: unknown;
  onChange: (val: unknown) => void;
}> = ({ field, value, onChange }) => {
  const isRequired = Boolean(field.required);

  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
        {field.name} {isRequired && <span style={{ color: '#ef4444' }}>*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--pkh-border-subtle)',
            backgroundColor: 'var(--pkh-bg-surface)',
            color: 'var(--pkh-text-primary)',
            fontSize: '13px',
            resize: 'vertical',
          }}
          required={isRequired}
        />
      ) : field.type === 'number' ? (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          required={isRequired}
        />
      ) : field.type === 'date' ? (
        <Input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={isRequired}
        />
      ) : field.type === 'time' ? (
        <Input
          type="time"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={isRequired}
        />
      ) : field.type === 'checkbox' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.name}</span>
        </label>
      ) : field.type === 'select' ? (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--pkh-border-subtle)',
            backgroundColor: 'var(--pkh-bg-surface)',
            color: 'var(--pkh-text-primary)',
            fontSize: '13px',
          }}
          required={isRequired}
        >
          <option value="">-- เลือก --</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'url' ? (
        <Input
          type="url"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          required={isRequired}
        />
      ) : (
        <Input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={isRequired}
        />
      )}
    </div>
  );
};

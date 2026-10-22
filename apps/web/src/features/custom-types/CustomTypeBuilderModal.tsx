import React, { useState, useEffect } from 'react';
import {
  type CustomDataType,
  type CustomFieldSchema,
  type CustomFieldType,
  createCustomType,
  updateCustomType,
} from '../../api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export interface CustomTypeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  typeToEdit?: CustomDataType | null;
  onSaved: (savedType: CustomDataType) => void;
}

const FIELD_TYPE_OPTIONS: Array<{ value: CustomFieldType; label: string; icon: string }> = [
  { value: 'text', label: 'ข้อความสั้น (Text)', icon: '🔤' },
  { value: 'textarea', label: 'ข้อความยาว (Textarea)', icon: '📝' },
  { value: 'number', label: 'ตัวเลข (Number)', icon: '🔢' },
  { value: 'date', label: 'วันที่ (Date)', icon: '📅' },
  { value: 'time', label: 'เวลา (Time)', icon: '⏰' },
  { value: 'checkbox', label: 'กล่องเลือก (Checkbox)', icon: '☑️' },
  { value: 'select', label: 'ตัวเลือก (Dropdown/Select)', icon: '📋' },
  { value: 'url', label: 'ลิงก์เว็บ (URL)', icon: '🔗' },
  { value: 'file', label: 'ไฟล์แนบ (File)', icon: '📎' },
];

const PRESET_ICONS = ['🧩', '🍳', '💻', '🏋️', '💡', '🚗', '💊', '🎨', '🐶', '📚', '💰', '🎮'];
const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export const CustomTypeBuilderModal: React.FC<CustomTypeBuilderModalProps> = ({
  isOpen,
  onClose,
  typeToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🧩');
  const [color, setColor] = useState('#3b82f6');
  const [category, setCategory] = useState('ข้อมูลที่กำหนดเอง');
  const [isShared, setIsShared] = useState(false);
  const [fields, setFields] = useState<CustomFieldSchema[]>([
    { id: 'f-1', name: 'ชื่อรายการ', type: 'text', required: true },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeToEdit) {
      setName(typeToEdit.name || '');
      setDescription(typeToEdit.description || '');
      setIcon(typeToEdit.icon || '🧩');
      setColor(typeToEdit.color || '#3b82f6');
      setCategory(typeToEdit.category || 'ข้อมูลที่กำหนดเอง');
      setIsShared(typeToEdit.isShared || false);
      setFields(
        Array.isArray(typeToEdit.fields) && typeToEdit.fields.length > 0
          ? typeToEdit.fields
          : [{ id: 'f-1', name: 'ชื่อรายการ', type: 'text', required: true }]
      );
    } else {
      setName('');
      setDescription('');
      setIcon('🧩');
      setColor('#3b82f6');
      setCategory('ข้อมูลที่กำหนดเอง');
      setIsShared(false);
      setFields([{ id: 'f-1', name: 'ชื่อรายการ', type: 'text', required: true }]);
    }
    setError(null);
  }, [typeToEdit, isOpen]);

  const addField = () => {
    const newId = `f-${Date.now()}`;
    setFields((prev) => [
      ...prev,
      { id: newId, name: `ฟิลด์ ${prev.length + 1}`, type: 'text', required: false },
    ]);
  };

  const removeField = (index: number) => {
    if (fields.length <= 1) return;
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<CustomFieldSchema>) => {
    setFields((prev) =>
      prev.map((field, i) => (i === index ? { ...field, ...updates } : field))
    );
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === fields.length - 1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setFields((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณาระบุชื่อประเภทข้อมูล');
      return;
    }
    if (fields.length === 0 || fields.some((f) => !f.name.trim())) {
      setError('กรุณาระบุชื่อให้กับทุกฟิลด์ข้อมูล');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let saved: CustomDataType;
      if (typeToEdit) {
        saved = await updateCustomType(typeToEdit.id, {
          name: name.trim(),
          description: description.trim(),
          icon,
          color,
          category,
          isShared,
          fields,
        });
      } else {
        saved = await createCustomType({
          name: name.trim(),
          description: description.trim(),
          icon,
          color,
          category,
          isShared,
          fields,
        });
      }
      onSaved(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกประเภทข้อมูลได้');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={typeToEdit ? '✎ แก้ไขประเภทข้อมูล' : '＋ สร้างประเภทข้อมูลใหม่ (Custom Data Type)'}
      size="lg"
    >
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '78vh', overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', width: '100%', boxSizing: 'border-box' }}>
        {error && (
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
            ⚠️ {error}
          </div>
        )}

        {/* Row 1: Dedicated Icon Selection */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.03))',
            border: '1px solid var(--pkh-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
              ไอคอนประจำประเภทข้อมูล
            </label>
            <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
              เลือกไอคอนแนะนำ หรือพิมพ์ Emoji ที่ต้องการ
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  fontSize: '28px',
                  borderRadius: '12px',
                  border: '2px solid var(--pkh-border-default)',
                  backgroundColor: 'var(--pkh-bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              >
                {icon || '🧩'}
              </div>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
                placeholder="Emoji"
                aria-label="ไอคอนประเภทข้อมูล"
                style={{
                  width: '54px',
                  height: '38px',
                  fontSize: '18px',
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: '1px solid var(--pkh-border-subtle)',
                  backgroundColor: 'var(--pkh-bg-surface)',
                  color: 'var(--pkh-text-primary)',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: '1 1 260px' }}>
              {PRESET_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  style={{
                    width: '38px',
                    height: '38px',
                    border: icon === emoji ? '2px solid var(--pkh-primary, #3b82f6)' : '1px solid var(--pkh-border-subtle)',
                    backgroundColor: icon === emoji ? 'rgba(59, 130, 246, 0.15)' : 'var(--pkh-bg-surface)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Name and Description (Full width, clear and readable) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--pkh-text-secondary)' }}>
              ชื่อประเภทข้อมูล <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น คลังสูตรอาหาร, อุปกรณ์ไอที, บันทึกการออกกำลังกาย"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--pkh-text-secondary)' }}>
              คำอธิบายสั้น
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุวัตถุประสงค์ของการจัดเก็บข้อมูลนี้..."
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Color and Category */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--pkh-text-secondary)' }}>
              สีประจำประเภท
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: '36px', height: '36px', padding: 0, border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                aria-label="เลือกสี"
              />
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: color === c ? '2px solid white' : '1px solid transparent',
                      outline: color === c ? '2px solid var(--pkh-primary)' : 'none',
                      cursor: 'pointer',
                    }}
                    aria-label={`เลือกสี ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--pkh-text-secondary)' }}>
              หมวดหมู่ใน Sidebar
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--pkh-border-subtle)',
                backgroundColor: 'var(--pkh-bg-surface)',
                color: 'var(--pkh-text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="ข้อมูลที่กำหนดเอง">ข้อมูลที่กำหนดเอง (Custom)</option>
              <option value="งาน & ตารางชีวิต">งาน & ตารางชีวิต</option>
              <option value="ความรู้ & ไฟล์">ความรู้ & ไฟล์</option>
              <option value="ไลฟ์สไตล์">ไลฟ์สไตล์</option>
            </select>
          </div>
        </div>

        {/* Dynamic Field Builder Header */}
        <div style={{ borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                🛠️ กำหนดฟิลด์ข้อมูล (Data Schema Builder)
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                ออกแบบคอลัมน์ข้อมูลที่ต้องการกรอกในประเภทนี้
              </p>
            </div>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={addField}
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              ＋ เพิ่มฟิลด์
            </Button>
          </div>

          {/* Field Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {fields.map((field, idx) => (
              <div
                key={field.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.04))',
                  border: '1px solid var(--pkh-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                  <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)', width: '22px', flexShrink: 0 }}>
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => updateField(idx, { name: e.target.value })}
                    placeholder="ชื่อฟิลด์ เช่น วันหมดอายุ, แคลอรี่"
                    style={{
                      flex: '1 1 180px',
                      minWidth: '130px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--pkh-border-subtle)',
                      backgroundColor: 'var(--pkh-bg-surface)',
                      color: 'var(--pkh-text-primary)',
                      fontSize: '13px',
                    }}
                    required
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(idx, { type: e.target.value as CustomFieldType })}
                    style={{
                      flex: '0 1 180px',
                      minWidth: '130px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--pkh-border-subtle)',
                      backgroundColor: 'var(--pkh-bg-surface)',
                      color: 'var(--pkh-text-primary)',
                      fontSize: '12px',
                    }}
                  >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </select>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    <span>จำเป็น</span>
                  </label>

                  <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => moveField(idx, 'up')}
                      disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: idx === 0 ? 0.3 : 0.8, padding: '4px', borderRadius: '4px' }}
                      title="เลื่อนขึ้น"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(idx, 'down')}
                      disabled={idx === fields.length - 1}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: idx === fields.length - 1 ? 0.3 : 0.8, padding: '4px', borderRadius: '4px' }}
                      title="เลื่อนลง"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(idx)}
                      disabled={fields.length <= 1}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: fields.length <= 1 ? 0.3 : 0.8, padding: '4px 6px', borderRadius: '4px', marginLeft: '4px' }}
                      title="ลบฟิลด์นี้"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Sub-options for 'select' type */}
                {field.type === 'select' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>ตัวเลือก (คั่นด้วยจุลภาค ,):</span>
                    <input
                      type="text"
                      value={(field.options || []).join(', ')}
                      onChange={(e) =>
                        updateField(idx, {
                          options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      placeholder="เช่น เล็ก, กลาง, ใหญ่ หรือ สูง, ต่ำ"
                      style={{
                        flex: '1',
                        padding: '4px 8px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        border: '1px solid var(--pkh-border-subtle)',
                        backgroundColor: 'var(--pkh-bg-surface)',
                        color: 'var(--pkh-text-primary)',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px' }}>
          <Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : typeToEdit ? 'บันทึกการแก้ไข' : 'สร้างประเภทข้อมูล'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

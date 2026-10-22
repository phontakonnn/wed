import React, { useEffect } from 'react';
import { Button } from './ui/Button';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        style={{ maxWidth: '600px', width: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🧠</span>
            <div>
              <h2 id="about-modal-title" style={{ margin: 0, fontSize: '18px' }}>
                เกี่ยวกับระบบ — สมองของคุณ
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                PKH / Life OS · Personal Knowledge Base & Life Management
              </span>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', lineHeight: 1.6 }}>
          {/* Version & Developer Badge */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'var(--pkh-bg-subtle, #f1f5f9)',
              border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>เวอร์ชันระบบ (Version)</div>
              <strong style={{ fontSize: '15px', color: 'var(--pkh-primary, #3b82f6)' }}>
                v3.0.0 (Production Release)
              </strong>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>ผู้พัฒนา (Developer)</div>
              <strong style={{ fontSize: '15px', color: 'var(--pkh-text-primary, #0f172a)' }}>
                _phontakonnn
              </strong>
            </div>
          </div>

          {/* System Purpose */}
          <div>
            <h3 style={{ fontSize: '15px', margin: '0 0 6px', color: 'var(--pkh-text-primary)' }}>
              🎯 วัตถุประสงค์ของระบบ
            </h3>
            <p style={{ margin: 0, color: 'var(--pkh-text-secondary)' }}>
              “สมองของคุณ” (PKH / Life OS) คือระบบปฏิบัติการชีวิตส่วนบุคคลและศูนย์รวมความรู้ (Second Brain)
              ที่ออกแบบมาเพื่อบันทึก จัดการ และเชื่อมโยงทุกมิติของชีวิต ทั้งบันทึกช่วยจำ, งานที่ต้องทำ,
              เป้าหมายชีวิต, ข้อมูลคนสำคัญ, คลังรหัสผ่านและเอกสารส่วนตัว, แผนการเดินทาง, ตลอดจนปฏิทินอัจฉริยะ
            </p>
          </div>

          {/* System Architecture */}
          <div>
            <h3 style={{ fontSize: '15px', margin: '0 0 6px', color: 'var(--pkh-text-primary)' }}>
              🏗️ สถาปัตยกรรมระบบ (Architecture)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <div style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}>
                <strong style={{ fontSize: '13px' }}>Backend API</strong>
                <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>Fastify + TypeScript + Node.js</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}>
                <strong style={{ fontSize: '13px' }}>Database</strong>
                <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>SQLite3 (WAL Mode, FTS5 Trigram, ACID)</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}>
                <strong style={{ fontSize: '13px' }}>Frontend UI</strong>
                <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>React 18 + Vite + CSS Variables</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}>
                <strong style={{ fontSize: '13px' }}>Security</strong>
                <div style={{ fontSize: '12px', color: 'var(--pkh-text-muted)' }}>OWASP ASVS, RBAC, TOTP 2FA, Audit Logs</div>
              </div>
            </div>
          </div>

          {/* Feedback & Bug Report */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span>💬</span>
              <strong style={{ fontSize: '13px', color: 'var(--pkh-primary, #3b82f6)' }}>
                แจ้งปัญหาการใช้งานหรือข้อเสนอแนะ
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-secondary)' }}>
              หากพบปัญหาหรือต้องการเสนอแนะฟีเจอร์เพิ่มเติม สามารถแจ้งได้โดยตรงกับทีมพัฒนาผ่านช่องทางนักพัฒนา{' '}
              <strong>_phontakonnn</strong> หรือรายงานผ่านทีมผู้ดูแลระบบ (Admin)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
          <Button variant="primary" type="button" onClick={onClose}>
            เข้าใจแล้ว
          </Button>
        </div>
      </section>
    </div>
  );
};

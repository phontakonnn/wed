import React, { useState } from 'react';
import {
  getSavedFirebaseConfig,
  saveFirebaseConfig,
  clearFirebaseConfig,
  initFirebase,
  isFirebaseConfigured,
  type FirebaseConfig,
} from '../../lib/firebaseConfig';
import { Button } from '../../components/ui/Button';

interface FirebaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: () => void;
  onSaved?: () => void;
}

export const FirebaseSetupModal: React.FC<FirebaseSetupModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
  onSaved,
}) => {
  const [config, setConfig] = useState<FirebaseConfig>(() => {
    return (
      getSavedFirebaseConfig() || {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
      }
    );
  });

  const [jsonInput, setJsonInput] = useState('');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const isConfigured = isFirebaseConfigured();

  if (!isOpen) return null;

  const handleParseJson = () => {
    try {
      setError('');
      // Clean up js snippet if user pasted: const firebaseConfig = { ... };
      const cleaned = jsonInput
        .replace(/const\s+firebaseConfig\s*=\s*/, '')
        .replace(/;\s*$/, '')
        .trim();
      // Allow relaxed JSON parsing for unquoted keys
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback eval in safe scope
        // eslint-disable-next-line no-new-func
        parsed = Function(`"use strict"; return (${cleaned});`)();
      }

      if (!parsed.apiKey || !parsed.projectId) {
        setError('JSON ต้องมี apiKey และ projectId เป็นอย่างน้อย');
        return;
      }

      setConfig({
        apiKey: parsed.apiKey || '',
        authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        projectId: parsed.projectId || '',
        storageBucket: parsed.storageBucket || '',
        messagingSenderId: parsed.messagingSenderId || '',
        appId: parsed.appId || '',
      });
      setMode('form');
      setNotice('นำเข้าการตั้งค่าจาก JSON สำเร็จ! กรุณาตรวจสอบแล้วกดบันทึก');
    } catch (err: any) {
      setError('รูปแบบ JSON ไม่ถูกต้อง: ' + (err.message || ''));
    }
  };

  const handleSave = () => {
    if (!config.apiKey.trim() || !config.projectId.trim()) {
      setError('กรุณากรอก API Key และ Project ID');
      return;
    }
    saveFirebaseConfig(config);
    initFirebase();
    setNotice('บันทึกการตั้งค่า Firebase สำเร็จ! ระบบเชื่อมต่อเรียบร้อยแล้ว');
    setTimeout(() => {
      onConfigUpdated?.();
      onSaved?.();
      onClose();
    }, 800);
  };

  const handleClear = () => {
    if (!window.confirm('คุณต้องการยกเลิกการเชื่อมต่อ Firebase และกลับสู่โหมด Local Fallback หรือไม่?')) return;
    clearFirebaseConfig();
    setConfig({
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    });
    setNotice('ยกเลิกการเชื่อมต่อ Firebase แล้ว ระบบทำงานในโหมด Local Fallback');
    setTimeout(() => {
      onConfigUpdated?.();
      onSaved?.();
    }, 600);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <section
        className="studio-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="ตั้งค่าเชื่อมต่อ Firebase"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          gap: '16px',
          overflowY: 'auto',
          borderRadius: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--pkh-border-subtle)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>🔥</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--pkh-text-primary)' }}>
                ตั้งค่าเชื่อมต่อ Firebase (Serverless)
              </h2>
              <span style={{ fontSize: '11.5px', color: 'var(--pkh-text-muted)' }}>
                Spark Plan ฟรี 100% (Auth, Firestore, Push Notifications)
              </span>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="ปิด" style={{ fontSize: '20px' }}>
            ✕
          </button>
        </div>

        {/* Status Badge */}
        <div style={{
          padding: '10px 14px',
          borderRadius: '10px',
          background: isConfigured ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          border: isConfigured ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: isConfigured ? '#047857' : '#b45309' }}>
              {isConfigured ? '🟢 เชื่อมต่อกับ Firebase สำเร็จ (Active)' : '⚪ ใช้งานในโหมด Local Fallback'}
            </span>
            <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)', marginTop: '2px' }}>
              {isConfigured ? `Project: ${config.projectId}` : 'ระบบใช้งานได้ทันทีและจัดเก็บข้อมูลในเบราว์เซอร์'}
            </div>
          </div>
          {isConfigured && (
            <Button variant="danger-quiet" size="sm" type="button" onClick={handleClear} style={{ fontSize: '11px' }}>
              ตัดการเชื่อมต่อ
            </Button>
          )}
        </div>

        {notice && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#047857', fontSize: '12px' }}>
            {notice}
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#b91c1c', fontSize: '12px' }}>
            {error}
          </div>
        )}

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`button ${mode === 'form' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => setMode('form')}
            style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
          >
            กรอกรายฟิลด์ (Form)
          </button>
          <button
            type="button"
            className={`button ${mode === 'json' ? 'button-primary' : 'button-quiet'}`}
            onClick={() => setMode('json')}
            style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
          >
            วางโค้ด JSON Config
          </button>
        </div>

        {mode === 'json' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
              วางโค้ด firebaseConfig จาก Firebase Console (Project Settings &gt; General &gt; Your apps):
            </label>
            <textarea
              rows={8}
              placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "my-app.firebaseapp.com",\n  projectId: "my-app",\n  appId: "1:..."\n};`}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-input, #fff)',
                boxSizing: 'border-box',
                width: '100%',
              }}
            />
            <Button variant="secondary" size="sm" type="button" onClick={handleParseJson} disabled={!jsonInput.trim()}>
              ⚡ นำเข้าจาก JSON
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                API Key *
              </label>
              <input
                type="text"
                required
                placeholder="AIzaSy..."
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', borderRadius: '6px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  Project ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="my-life-os"
                  value={config.projectId}
                  onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', borderRadius: '6px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  Auth Domain
                </label>
                <input
                  type="text"
                  placeholder="my-life-os.firebaseapp.com"
                  value={config.authDomain}
                  onChange={(e) => setConfig({ ...config, authDomain: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', borderRadius: '6px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  Messaging Sender ID
                </label>
                <input
                  type="text"
                  placeholder="123456789"
                  value={config.messagingSenderId || ''}
                  onChange={(e) => setConfig({ ...config, messagingSenderId: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', borderRadius: '6px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                  App ID
                </label>
                <input
                  type="text"
                  placeholder="1:123456789:web:..."
                  value={config.appId}
                  onChange={(e) => setConfig({ ...config, appId: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', borderRadius: '6px' }}
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
          <Button variant="quiet" size="sm" type="button" onClick={onClose}>
            ปิด
          </Button>
          <Button variant="primary" size="sm" type="button" onClick={handleSave}>
            💾 บันทึก & เชื่อมต่อทันที
          </Button>
        </div>
      </section>
    </div>
  );
};

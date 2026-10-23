import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getItemShares, shareItem, unshareItem } from '../api';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { errorMessage } from '../lib/formatters';

interface ShareItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: string;
  itemId: string;
  itemTitle?: string;
}

export const ShareItemModal: React.FC<ShareItemModalProps> = ({
  isOpen,
  onClose,
  itemType,
  itemId,
  itemTitle,
}) => {
  const queryClient = useQueryClient();
  const sharesKey = ['itemShares', itemType, itemId] as const;
  const [targetUsername, setTargetUsername] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Shares are server state: TanStack Query owns loading/error/caching so the
  // component never has to mirror them in an effect.
  const sharesQuery = useQuery({
    queryKey: sharesKey,
    queryFn: async () => (await getItemShares(itemType, itemId)).shares,
    enabled: isOpen && Boolean(itemId),
  });

  const shares = sharesQuery.data ?? [];
  const loading = sharesQuery.isPending && sharesQuery.fetchStatus !== 'idle';

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await shareItem({
        itemType,
        itemId,
        targetUsername: targetUsername.trim(),
        permission,
      });
      setMsg({ text: `แชร์ให้กับ ${targetUsername.trim()} สำเร็จแล้ว!`, type: 'success' });
      setTargetUsername('');
      await queryClient.invalidateQueries({ queryKey: sharesKey });
    } catch (err) {
      setMsg({ text: errorMessage(err) || 'แชร์รายการไม่สำเร็จ', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleUnshare = async (shareId: string) => {
    try {
      await unshareItem(shareId);
      queryClient.setQueryData(sharesKey, (prev: typeof shares | undefined) =>
        (prev ?? []).filter((s) => s.id !== shareId),
      );
      setMsg({ text: 'ยกเลิกการแชร์เรียบร้อยแล้ว', type: 'success' });
    } catch (err) {
      setMsg({ text: errorMessage(err) || 'ไม่สามารถยกเลิกการแชร์ได้', type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} title={`🔗 แชร์รายการ: ${itemTitle || itemId}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {msg && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              background: msg.type === 'success' ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
              color: msg.type === 'success' ? 'var(--color-success-text, #166534)' : 'var(--color-danger-text, #991b1b)',
            }}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600 }}>
            แชร์ให้กับผู้ใช้อื่นใน Workspace
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              placeholder="ระบุชื่อผู้ใช้ (Username)..."
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              disabled={busy}
              style={{ flex: 1 }}
              required
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'viewer' | 'editor')}
              disabled={busy}
              style={{
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                padding: '0 10px',
                fontSize: '13px',
              }}
            >
              <option value="viewer">👀 ดูได้อย่างเดียว (Viewer)</option>
              <option value="editor">✏️ แก้ไขได้ (Editor)</option>
            </select>
            <Button variant="primary" type="submit" disabled={busy || !targetUsername.trim()}>
              {busy ? 'กำลังแชร์...' : 'แชร์'}
            </Button>
          </div>
        </form>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            ผู้ที่สามารถเข้าถึงรายการนี้ได้
          </h4>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              กำลังโหลดข้อมูลการแชร์...
            </div>
          ) : shares.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              🔒 รายการนี้เป็นส่วนตัว (ยังไม่มีการแชร์ให้กับผู้อื่น)
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {shares.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-hover, rgba(0,0,0,0.03))',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>👤</span>
                    <strong style={{ fontSize: '13px' }}>{s.sharedWithUsername || s.sharedWithUserId}</strong>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: s.permission === 'editor' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                        color: s.permission === 'editor' ? '#2563eb' : 'var(--color-text-secondary)',
                      }}
                    >
                      {s.permission === 'editor' ? '✏️ แก้ไขได้' : '👀 ดูได้'}
                    </span>
                  </div>
                  <Button variant="danger-quiet" size="sm" onClick={() => handleUnshare(s.id)}>
                    ยกเลิกการแชร์
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <Button variant="quiet" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </Modal>
  );
};

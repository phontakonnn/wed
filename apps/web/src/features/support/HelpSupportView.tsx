import React, { useState, useEffect, useCallback } from 'react';
import {
  type SupportTicket,
  type SupportTicketReply,
  fetchSupportTickets,
  fetchSupportTicket,
  createSupportTicket,
  replySupportTicket,
} from '../../api';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';

export interface HelpSupportViewProps {
  onBackToHome?: () => void;
}

const CATEGORY_OPTIONS = [
  'การใช้งานทั่วไป',
  'ปัญหาเทคนิค & บั๊ก',
  'เสนอแนะฟีเจอร์ใหม่',
  'เรื่องความปลอดภัย & บัญชี',
  'อื่นๆ',
];

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'ต่ำ', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' },
  normal: { label: 'ปกติ', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
  high: { label: 'สูง', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  urgent: { label: 'เร่งด่วนมาก', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'รอตรวจสอบ', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  in_progress: { label: 'กำลังดำเนินการ', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  resolved: { label: 'แก้ไขแล้ว', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  closed: { label: 'ปิดเรื่อง', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' },
};

export const HelpSupportView: React.FC<HelpSupportViewProps> = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Ticket Modal
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [priority, setPriority] = useState('normal');
  const [message, setMessage] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Detail / Discussion Modal
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<SupportTicketReply[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSupportTickets(statusFilter === 'all' ? undefined : statusFilter);
      setTickets(data);
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถโหลดรายการคำร้องได้',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetchSupportTicket(ticketId);
      setActiveTicket(res.ticket);
      setReplies(res.replies);
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'ไม่สามารถเปิดรายละเอียดคำร้องได้',
      });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleOpenTicket = (ticket: SupportTicket) => {
    setSelectedTicketId(ticket.id);
    void loadTicketDetail(ticket.id);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setCreateError('กรุณากรอกหัวข้อและรายละเอียดให้ครบถ้วน');
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    try {
      const created = await createSupportTicket({
        subject: subject.trim(),
        category,
        priority,
        message: message.trim(),
      });
      setNotice({
        type: 'success',
        message: `ส่งคำร้องขอความช่วยเหลือรหัส ${created.referenceNo} เรียบร้อยแล้ว ทีมผู้ดูแลจะตรวจสอบโดยเร็ว`,
      });
      setNewTicketModalOpen(false);
      setSubject('');
      setMessage('');
      await loadTickets();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'ไม่สามารถส่งคำร้องได้');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyMessage.trim()) return;

    setReplyBusy(true);
    try {
      const newReply = await replySupportTicket(selectedTicketId, replyMessage.trim());
      setReplies((prev) => [...prev, newReply]);
      setReplyMessage('');
      await loadTicketDetail(selectedTicketId);
      await loadTickets();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถส่งข้อความได้');
    } finally {
      setReplyBusy(false);
    }
  };

  return (
    <section className="life-view-container" aria-label="ศูนย์ช่วยเหลือและติดต่อผู้ดูแล">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">💬</div>
        <div className="banner-info">
          <span className="eyebrow">Help Center &amp; Support</span>
          <h2 className="banner-title">ศูนย์ช่วยเหลือ &amp; ติดต่อผู้ดูแล</h2>
          <p className="banner-subtitle">
            แจ้งปัญหาการใช้งาน สอบถามการตั้งค่า หรือเสนอแนะฟีเจอร์ใหม่ · คุณสามารถติดตามสถานะและสนทนากับผู้ดูแลได้โดยตรง
          </p>
        </div>
        <div className="banner-actions">
          <Button variant="primary" onClick={() => setNewTicketModalOpen(true)}>
            ＋ ส่งคำร้องใหม่ (New Ticket)
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

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
        {[
          { id: 'all', label: 'ทั้งหมด' },
          { id: 'open', label: '⏳ รอตรวจสอบ' },
          { id: 'in_progress', label: '🔄 กำลังดำเนินการ' },
          { id: 'resolved', label: '✅ แก้ไขแล้ว' },
          { id: 'closed', label: '🔒 ปิดเรื่อง' },
        ].map((tab) => {
          const active = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: active ? '1px solid var(--pkh-primary)' : '1px solid var(--pkh-border-subtle)',
                backgroundColor: active ? 'var(--pkh-primary)' : 'var(--pkh-bg-surface)',
                color: active ? '#ffffff' : 'var(--pkh-text-secondary)',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tickets List */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
          กำลังโหลดรายการคำร้อง...
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="💬"
          title="ไม่มีคำร้องขอความช่วยเหลือ"
          description="หากคุณมีคำถามหรือพบปัญหา สามารถกดปุ่ม '+ ส่งคำร้องใหม่' เพื่อแจ้งผู้ดูแลระบบได้ทันที"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tickets.map((t) => {
            const statusInfo = STATUS_META[t.status] || { label: t.status, color: '#64748b', bg: '#f1f5f9' };
            const prioInfo = PRIORITY_META[t.priority] || { label: t.priority, color: '#64748b', bg: '#f1f5f9' };

            return (
              <div
                key={t.id}
                className="life-card"
                onClick={() => handleOpenTicket(t)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${statusInfo.color}`,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--pkh-primary)', fontFamily: 'monospace' }}>
                      {t.referenceNo}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: statusInfo.bg,
                        color: statusInfo.color,
                        fontWeight: 600,
                      }}
                    >
                      {statusInfo.label}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: prioInfo.bg,
                        color: prioInfo.color,
                      }}
                    >
                      ความเร่งด่วน: {prioInfo.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                      หมวด: {t.category}
                    </span>
                  </div>

                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--pkh-text-primary)' }}>
                    {t.subject}
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: 'var(--pkh-text-secondary)',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {t.message}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'var(--pkh-text-muted)', marginTop: '4px' }}>
                    <span>ส่งเมื่อ: {formatDate(t.createdAt)}</span>
                    {t.repliesCount !== undefined && t.repliesCount > 0 && (
                      <span style={{ color: 'var(--pkh-primary)', fontWeight: 600 }}>
                        💬 มี {t.repliesCount} ข้อความตอบกลับ
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '16px' }}>
                  <Button variant="quiet" size="sm">
                    ดูการตอบกลับ →
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Ticket Modal */}
      <Modal
        isOpen={newTicketModalOpen}
        onClose={() => {
          if (!createBusy) setNewTicketModalOpen(false);
        }}
        title="💬 ส่งคำร้องขอความช่วยเหลือใหม่"
      >
        <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {createError && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
              ⚠️ {createError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
              หัวข้อคำร้อง <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="สรุปปัญหาหรือคำถามสั้นๆ..."
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
                หมวดหมู่
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
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
                ความเร่งด่วน
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
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
                <option value="low">ต่ำ (มีเวลาตรวจสอบได้)</option>
                <option value="normal">ปกติ</option>
                <option value="high">สูง (ส่งผลต่อการใช้งาน)</option>
                <option value="urgent">เร่งด่วนมาก (ระบบใช้งานไม่ได้)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--pkh-text-secondary)' }}>
              รายละเอียดคำร้อง <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="อธิบายขั้นตอนที่เกิดปัญหา อุปกรณ์ที่ใช้ หรือสิ่งที่ต้องการให้ช่วยเหลืออย่างละเอียด..."
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
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: '1px solid var(--pkh-border-subtle)', paddingTop: '12px' }}>
            <Button
              type="button"
              variant="quiet"
              onClick={() => setNewTicketModalOpen(false)}
              disabled={createBusy}
            >
              ยกเลิก
            </Button>
            <Button type="submit" variant="primary" disabled={createBusy}>
              {createBusy ? 'กำลังส่ง…' : 'ส่งคำร้อง'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ticket Details & Discussion Modal */}
      <Modal
        isOpen={Boolean(selectedTicketId)}
        onClose={() => {
          setSelectedTicketId(null);
          setActiveTicket(null);
          setReplies([]);
        }}
        title={activeTicket ? `🎫 คำร้อง ${activeTicket.referenceNo}: ${activeTicket.subject}` : 'กำลังโหลด...'}
      >
        {detailLoading || !activeTicket ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
            กำลังโหลดข้อมูลการสนทนา...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Status Header Info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                backgroundColor: 'var(--pkh-bg-subtle, rgba(255,255,255,0.05))',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    backgroundColor: STATUS_META[activeTicket.status]?.bg,
                    color: STATUS_META[activeTicket.status]?.color,
                    fontWeight: 600,
                  }}
                >
                  {STATUS_META[activeTicket.status]?.label}
                </span>
                <span style={{ color: 'var(--pkh-text-muted)' }}>หมวด: {activeTicket.category}</span>
              </div>
              <time style={{ color: 'var(--pkh-text-muted)', fontSize: '11px' }}>
                {formatDate(activeTicket.createdAt)}
              </time>
            </div>

            {/* Original message */}
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: 'var(--pkh-bg-surface)',
                border: '1px solid var(--pkh-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <strong>{activeTicket.userDisplayName || activeTicket.userName || 'สมาชิก'}</strong>
                <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>(ผู้แจ้ง)</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                {activeTicket.message}
              </div>
            </div>

            {/* Replies timeline */}
            {replies.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ margin: '8px 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-muted)' }}>
                  💬 การสนทนา ({replies.length})
                </h4>
                {replies.map((r) => {
                  const isAdmin = r.userRole === 'admin';
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        backgroundColor: isAdmin ? 'rgba(59, 130, 246, 0.08)' : 'var(--pkh-bg-surface)',
                        border: isAdmin ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--pkh-border-subtle)',
                        alignSelf: isAdmin ? 'flex-end' : 'flex-start',
                        width: '90%',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '13px', color: isAdmin ? 'var(--pkh-primary)' : 'var(--pkh-text-primary)' }}>
                            {isAdmin ? '🛡️ ผู้ดูแลระบบ' : r.userDisplayName || r.userName || 'คุณ'}
                          </strong>
                          {isAdmin && r.userDisplayName && (
                            <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                              ({r.userDisplayName})
                            </span>
                          )}
                        </div>
                        <time style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                          {formatDate(r.createdAt)}
                        </time>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '13px', color: 'var(--pkh-text-primary)' }}>
                        {r.message}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reply Input Box */}
            <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                พิมพ์ข้อความตอบกลับ
              </label>
              <textarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                rows={3}
                placeholder="พิมพ์ข้อความตอบกลับผู้ดูแลที่นี่..."
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
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" size="sm" disabled={replyBusy}>
                  {replyBusy ? 'กำลังส่ง…' : 'ส่งข้อความตอบกลับ'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </section>
  );
};

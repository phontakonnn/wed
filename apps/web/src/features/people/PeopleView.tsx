import React, { useRef, type ChangeEvent, type FormEvent } from 'react';
import type { Person, RelationshipGroup, Note, StoredFile } from '../../api';
import type { NotesView } from '../../types';
import { EntityAttachments } from '../../components/EntityAttachments';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export type PersonDraft = Partial<Person> & { name: string; relationshipGroup: RelationshipGroup };

export interface PeopleViewProps {
  people: Person[];
  activePerson: Person | null;
  peopleQuery: string;
  setPeopleQuery: (query: string) => void;
  peopleGroup: RelationshipGroup | '';
  setPeopleGroup: (group: RelationshipGroup | '') => void;
  personDraft: PersonDraft;
  setPersonDraft: React.Dispatch<React.SetStateAction<PersonDraft>>;
  personBusy: boolean;
  personError: string;
  personNotice: string;
  personAvatarBusy: boolean;
  personNotes: Note[];
  onStartNewPerson: () => void;
  onSelectPerson: (person: Person) => void;
  onSavePerson: (e: FormEvent) => void;
  onDeletePerson: () => Promise<void>;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onCreateReminderForPerson: () => Promise<void>;
  onStartNoteForPerson: () => void;
  onOpenPersonNote: (note: Note) => void;
  onSwitchView: (view: NotesView) => void;
  files: StoredFile[];
  onFilesChanged: () => void;
}

const GROUP_LABELS: Record<string, string> = {
  family: 'ครอบครัว',
  friend: 'เพื่อน',
  colleague: 'เพื่อนร่วมงาน/ธุรกิจ',
  mentor: 'ที่ปรึกษา/ครู',
  other: 'อื่น ๆ',
};

export const PeopleView: React.FC<PeopleViewProps> = ({
  people,
  activePerson,
  peopleQuery,
  setPeopleQuery,
  peopleGroup,
  setPeopleGroup,
  personDraft,
  setPersonDraft,
  personBusy,
  personError,
  personNotice,
  personAvatarBusy,
  personNotes,
  onStartNewPerson,
  onSelectPerson,
  onSavePerson,
  onDeletePerson,
  onAvatarUpload,
  onCreateReminderForPerson,
  onStartNoteForPerson,
  onOpenPersonNote,
  files,
  onFilesChanged,
}) => {
  const personAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const filteredPeople = people.filter((person) => {
    if (peopleGroup && person.relationshipGroup !== peopleGroup) return false;
    if (!peopleQuery.trim()) return true;
    const query = peopleQuery.trim().toLowerCase();
    return (
      person.name.toLowerCase().includes(query) ||
      (person.roleLabel ?? '').toLowerCase().includes(query) ||
      (person.memo ?? '').toLowerCase().includes(query)
    );
  });

  return (
    <section className="life-view-container" aria-label="จัดการบุคคลสำคัญ">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">👥</div>
        <div className="banner-info">
          <span className="eyebrow">Personal CRM &amp; Network</span>
          <h2 className="banner-title">บุคคลสำคัญ</h2>
          <p className="banner-subtitle">
            {people.length} รายการ · บันทึกวันสำคัญ ความชอบ อาหารที่แพ้ และข้อมูลใส่ใจ
          </p>
        </div>
        <div className="banner-actions">
          <Button variant="primary" onClick={onStartNewPerson}>
            ＋ เพิ่มบุคคล
          </Button>
          {activePerson && (
            <Button
              variant="danger-quiet"
              disabled={personBusy}
              onClick={() => void onDeletePerson()}
            >
              ลบบุคคลนี้
            </Button>
          )}
        </div>
      </div>

      {personError && <p className="form-error editor-error" role="alert">{personError}</p>}
      {personNotice && <p className="form-notice" role="status">{personNotice}</p>}

      {/* Master-Detail Grid */}
      <div className="notes-master-detail" style={{ minHeight: '600px' }}>
        {/* Left: People List */}
        <aside className="notes-master-pane" aria-label="รายชื่อบุคคล">
          <div className="notes-master-header">
            <div className="notes-master-top">
              <span className="notes-master-title">
                บุคคลทั้งหมด <span className="notes-count-badge">{filteredPeople.length}</span>
              </span>
            </div>
            <div className="notes-search-wrap">
              <span className="notes-search-icon">🔍</span>
              <input
                type="search"
                placeholder="ค้นหาชื่อ บทบาท โน้ตย่อ..."
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
              />
            </div>
            <select
              value={peopleGroup}
              onChange={(e) => setPeopleGroup(e.target.value as RelationshipGroup | '')}
              style={{
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: 'var(--pkh-radius-md)',
                border: '1px solid var(--pkh-border-default)',
                background: 'var(--pkh-bg-surface)',
                color: 'var(--pkh-text-primary)',
              }}
            >
              <option value="">ทุกกลุ่มความสัมพันธ์</option>
              <option value="family">ครอบครัว</option>
              <option value="friend">เพื่อน</option>
              <option value="colleague">เพื่อนร่วมงาน/ธุรกิจ</option>
              <option value="mentor">ที่ปรึกษา/ครู</option>
              <option value="other">อื่น ๆ</option>
            </select>
          </div>

          <div className="notes-list-scroll">
            {personBusy ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                <Skeleton height={60} borderRadius="12px" />
                <Skeleton height={60} borderRadius="12px" />
                <Skeleton height={60} borderRadius="12px" />
              </div>
            ) : filteredPeople.length === 0 ? (
              <div style={{ padding: '32px 16px' }}>
                <EmptyState
                  icon="👥"
                  title="ไม่พบบุคคล"
                  description={peopleQuery ? 'ไม่พบบุคคลตามคำค้นหา' : 'ยังไม่มีบุคคลในหมวดนี้'}
                  action={
                    <Button variant="primary" size="sm" onClick={onStartNewPerson}>
                      ＋ เพิ่มบุคคลแรก
                    </Button>
                  }
                />
              </div>
            ) : (
              filteredPeople.map((person) => {
                const isActive = activePerson?.id === person.id;
                return (
                  <article
                    key={person.id}
                    className={`person-bento-card ${isActive ? 'is-active' : ''}`}
                    onClick={() => onSelectPerson(person)}
                  >
                    <div className="person-card-head">
                      <div className="person-avatar-circle">
                        {person.avatarFileId ? (
                          <img src={`/api/files/${person.avatarFileId}`} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span>{person.avatarPreset || person.name.slice(0, 1)}</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ fontSize: '14px', color: 'var(--pkh-text-primary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {person.name}
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span className="task-priority-pill task-priority-normal" style={{ fontSize: '10px' }}>
                            {GROUP_LABELS[person.relationshipGroup] || person.relationshipGroup}
                          </span>
                          {person.roleLabel && (
                            <span style={{ fontSize: '11px', color: 'var(--pkh-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {person.roleLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {person.birthdayOrAnniversary && (
                      <div style={{ fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
                        🎂 {person.birthdayOrAnniversary}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Person Detail Form */}
        <main className="notes-detail-pane" aria-label="รายละเอียดบุคคล">
          <form className="notes-editor-body" onSubmit={onSavePerson}>
            {/* Avatar & Preset Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingBottom: '16px', borderBottom: '1px solid var(--pkh-border-subtle)' }}>
              <div className="person-avatar-circle" style={{ width: '60px', height: '60px', fontSize: '24px' }}>
                {personDraft.avatarFileId ? (
                  <img src={`/api/files/${personDraft.avatarFileId}`} alt="" loading="lazy" decoding="async" />
                ) : (
                  personDraft.avatarPreset || (personDraft.name || 'P').slice(0, 1)
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <select
                  value={personDraft.avatarPreset ?? ''}
                  onChange={(e) => setPersonDraft({ ...personDraft, avatarPreset: e.target.value })}
                  style={{
                    fontSize: '13px',
                    padding: '6px 10px',
                    borderRadius: 'var(--pkh-radius-md)',
                    border: '1px solid var(--pkh-border-default)',
                    background: 'var(--pkh-bg-surface)',
                  }}
                  aria-label="อวตารสำเร็จรูป"
                >
                  {['🌿', '🌸', '🦊', '🐼', '💙', '⭐', '☕', '🎯'].map((preset) => (
                    <option value={preset} key={preset}>{preset}</option>
                  ))}
                </select>
                <Button
                  variant="quiet"
                  size="sm"
                  type="button"
                  onClick={() => personAvatarInputRef.current?.click()}
                  disabled={personAvatarBusy}
                >
                  {personAvatarBusy ? 'กำลังอัปโหลด…' : '📷 อัปโหลดรูป'}
                </Button>
                <input
                  ref={personAvatarInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void onAvatarUpload(e)}
                />
              </div>
            </div>

            <div className="life-form-grid">
              <div className="life-field-group">
                <label htmlFor="person-name">ชื่อ-นามสกุล / ชื่อเล่น *</label>
                <input
                  id="person-name"
                  required
                  value={personDraft.name}
                  onChange={(e) => setPersonDraft({ ...personDraft, name: e.target.value })}
                  maxLength={120}
                  placeholder="เช่น สมชาย ใจดี (พี่ชาย)"
                />
              </div>

              <div className="life-field-group">
                <label htmlFor="person-group">กลุ่มความสัมพันธ์</label>
                <select
                  id="person-group"
                  value={personDraft.relationshipGroup}
                  onChange={(e) => setPersonDraft({
                    ...personDraft,
                    relationshipGroup: e.target.value as RelationshipGroup,
                  })}
                >
                  <option value="family">ครอบครัว</option>
                  <option value="friend">เพื่อน</option>
                  <option value="colleague">เพื่อนร่วมงาน/ธุรกิจ</option>
                  <option value="mentor">ที่ปรึกษา/ครู</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </div>

              <div className="life-field-group">
                <label htmlFor="person-role">บทบาท / บริษัท / ตำแหน่ง</label>
                <input
                  id="person-role"
                  value={personDraft.roleLabel ?? ''}
                  onChange={(e) => setPersonDraft({ ...personDraft, roleLabel: e.target.value })}
                  maxLength={120}
                  placeholder="เช่น Lead Designer @ Acme"
                />
              </div>

              <div className="life-field-group">
                <label htmlFor="person-bday">วันเกิด / วันสำคัญ (YYYY-MM-DD หรือ MM-DD)</label>
                <input
                  id="person-bday"
                  value={personDraft.birthdayOrAnniversary ?? ''}
                  onChange={(e) => setPersonDraft({ ...personDraft, birthdayOrAnniversary: e.target.value })}
                  maxLength={20}
                  placeholder="2000-08-25 หรือ 08-25"
                />
              </div>

              <div className="life-field-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="person-contact">เบอร์โทร / ช่องทางติดต่อ</label>
                <input
                  id="person-contact"
                  value={personDraft.phone ?? ''}
                  onChange={(e) => setPersonDraft({ ...personDraft, phone: e.target.value })}
                  maxLength={120}
                  placeholder="081-xxx-xxxx, Line ID, อีเมล"
                />
              </div>
            </div>

            <div className="life-field-group">
              <label htmlFor="person-likes">สิ่งที่ชอบ / รสนิยม (Favorites &amp; Likes)</label>
              <textarea
                id="person-likes"
                rows={2}
                value={personDraft.favoritesAndLikes ?? ''}
                onChange={(e) => setPersonDraft({ ...personDraft, favoritesAndLikes: e.target.value })}
                placeholder="เช่น กาแฟดริปคั่วอ่อน, หนังสือไซไฟ, ชอบสีเขียวเข้ม..."
              />
            </div>

            <div className="life-field-group">
              <label htmlFor="person-allergies">แพ้อาหาร / ข้อควรระวัง (Allergies &amp; Medical)</label>
              <textarea
                id="person-allergies"
                rows={2}
                value={personDraft.allergiesAndMedical ?? ''}
                onChange={(e) => setPersonDraft({ ...personDraft, allergiesAndMedical: e.target.value })}
                placeholder="เช่น แพ้กุ้งรุนแรง, ไม่ดื่มแอลกอฮอล์..."
              />
            </div>

            <div className="life-field-group">
              <label htmlFor="person-gifts">ไอเดียของขวัญ / ขนาดเสื้อผ้า-รองเท้า (Gift Ideas &amp; Sizes)</label>
              <textarea
                id="person-gifts"
                rows={2}
                value={personDraft.giftIdeasAndSizes ?? ''}
                onChange={(e) => setPersonDraft({ ...personDraft, giftIdeasAndSizes: e.target.value })}
                placeholder="เช่น เสื้อไซส์ L, รองเท้า 42, กำลังมองหาหูฟังใหม่..."
              />
            </div>

            <div className="life-field-group">
              <label htmlFor="person-memo">บันทึกย่อ / เรื่องที่เคยคุยกัน (Memo)</label>
              <textarea
                id="person-memo"
                rows={3}
                value={personDraft.memo ?? ''}
                onChange={(e) => setPersonDraft({ ...personDraft, memo: e.target.value })}
                placeholder="เรื่องที่เจอกันล่าสุด ความทรงจำ หรือเรื่องที่ต้องถามคราวหน้า..."
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--pkh-border-subtle)' }}>
              <Button variant="primary" type="submit" disabled={personBusy}>
                {personBusy ? 'กำลังบันทึก…' : activePerson ? 'บันทึกข้อมูลบุคคล' : 'เพิ่มบุคคล'}
              </Button>
              {activePerson && (
                <>
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => void onCreateReminderForPerson()}
                    disabled={personBusy}
                  >
                    🔔 ตั้งแจ้งเตือนวันสำคัญ
                  </Button>
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={onStartNoteForPerson}
                  >
                    📝 จดโน้ตเกี่ยวกับคนนี้
                  </Button>
                </>
              )}
            </div>
          </form>

          {activePerson && (
            <div style={{ padding: '0 24px 24px' }}>
              <EntityAttachments
                entityType="person"
                entityId={activePerson.id}
                availableFiles={files}
                onFilesChanged={onFilesChanged}
              />
            </div>
          )}

          {activePerson && personNotes.length > 0 && (
            <div style={{ padding: '0 24px 24px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px', color: 'var(--pkh-text-primary)' }}>
                โน้ตที่เกี่ยวข้อง ({personNotes.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {personNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="button button-quiet"
                    style={{ justifyContent: 'flex-start', padding: '8px 12px', fontSize: '13px' }}
                    onClick={() => onOpenPersonNote(note)}
                  >
                    📝 {note.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
};

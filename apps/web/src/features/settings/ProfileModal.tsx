import React, { useRef, type ChangeEvent, type FormEvent } from 'react';
import type { User } from '../../api';
import type { ProfileState } from '../../types';

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProfileState;
  setProfile: React.Dispatch<React.SetStateAction<ProfileState>>;
  user: User | null;
  onSaveProfile: (e: FormEvent) => void;
  onUploadAvatar: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  setProfile,
  user,
  onSaveProfile,
  onUploadAvatar,
}) => {
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="studio-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="โปรไฟล์ของฉัน"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="popover-head">
          <h2>โปรไฟล์ของฉัน</h2>
          <button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="profile-form" onSubmit={onSaveProfile}>
          <label>
            ชื่อที่แสดง
            <input
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              placeholder={user?.username ?? ''}
              maxLength={80}
            />
          </label>
          <label>
            สเตตัสประจำวัน
            <input
              value={profile.status}
              onChange={(event) => setProfile({ ...profile, status: event.target.value })}
              maxLength={120}
            />
          </label>
          <div className="avatar-row">
            <span className="avatar profile-avatar large">
              {profile.avatarFileId ? (
                <img src={`/api/files/${profile.avatarFileId}`} alt="" loading="lazy" decoding="async" />
              ) : (
                profile.avatarPreset || (profile.name || user?.username || 'P').slice(0, 1)
              )}
            </span>
            <select
              value={profile.avatarPreset}
              onChange={(event) => setProfile({ ...profile, avatarPreset: event.target.value })}
              aria-label="อวตารสำเร็จรูป"
            >
              {['🌿', '🌙', '☀️', '🦊', '🐼', '🌸', '💙', '⭐'].map((preset) => (
                <option value={preset} key={preset}>{preset}</option>
              ))}
            </select>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => profileAvatarInputRef.current?.click()}
            >
              อัปโหลดรูป
            </button>
            <input
              ref={profileAvatarInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(event) => void onUploadAvatar(event)}
            />
          </div>
          <button className="button button-primary" type="submit">บันทึกโปรไฟล์</button>
        </form>
      </section>
    </div>
  );
};

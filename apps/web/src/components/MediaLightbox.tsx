import React from 'react';
import type { StoredFile } from '../api';
import { fileIcon, formatBytes } from '../lib/formatters';

export interface MediaLightboxProps {
  file: StoredFile | null;
  onClose: () => void;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({ file, onClose }) => {
  if (!file) return null;

  return (
    <div className="media-lightbox-backdrop" onClick={onClose}>
      <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="media-lightbox-header">
          <div className="media-lightbox-title">
            <span style={{ fontSize: '20px' }}>{fileIcon(file.mediaType, file.displayName)}</span>
            <strong>{file.displayName}</strong>
            <span className="media-lightbox-meta">({formatBytes(file.sizeBytes)})</span>
          </div>
          <div className="media-lightbox-actions">
            <a
              className="button button-quiet"
              href={file.downloadUrl}
              download={file.displayName}
            >
              ⬇️ ดาวน์โหลด
            </a>
            <button
              className="media-lightbox-close"
              type="button"
              aria-label="ปิด (Escape)"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="media-lightbox-body">
          {file.mediaType.startsWith('image/') ? (
            <img
              src={file.downloadUrl}
              alt={file.displayName}
              className="lightbox-img"
              loading="lazy"
              decoding="async"
            />
          ) : file.mediaType.startsWith('video/') ||
            file.displayName.endsWith('.mp4') ||
            file.displayName.endsWith('.webm') ||
            file.displayName.endsWith('.mov') ? (
            <video
              src={file.downloadUrl}
              controls
              autoPlay
              playsInline
              className="lightbox-video"
            >
              เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ
            </video>
          ) : file.mediaType.startsWith('audio/') ||
            file.displayName.endsWith('.mp3') ||
            file.displayName.endsWith('.wav') ||
            file.displayName.endsWith('.m4a') ? (
            <div className="lightbox-audio-wrapper">
              <span style={{ fontSize: '48px' }}>🎵</span>
              <strong style={{ fontSize: '16px' }}>{file.displayName}</strong>
              <audio src={file.downloadUrl} controls autoPlay className="lightbox-audio" />
            </div>
          ) : file.mediaType === 'application/pdf' || file.displayName.endsWith('.pdf') ? (
            <iframe
              src={file.downloadUrl}
              title={file.displayName}
              className="lightbox-pdf"
            />
          ) : (
            <div className="lightbox-fallback">
              <span style={{ fontSize: '48px' }}>📄</span>
              <p>ไฟล์นี้ไม่รองรับการเล่นสดบนเว็บ ({file.mediaType})</p>
              <a className="button button-primary" href={file.downloadUrl} download={file.displayName}>
                ดาวน์โหลดไฟล์ลงเครื่อง
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

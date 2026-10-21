import React, { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import type { StoredFile, CustomCategory } from '../../api';
import { uploadFileWithProgress } from '../../api';
import { fileIcon, formatBytes, formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

export interface FilesViewProps {
  files: StoredFile[];
  activeFile: StoredFile | null;
  setActiveFile: (file: StoredFile | null) => void;
  onSetMediaLightboxFile: (file: StoredFile) => void;
  onDeleteFile: (file: StoredFile) => Promise<void>;
  notesError: string;
  notice: string;
  onUploadFiles: (e: ChangeEvent<HTMLInputElement>) => void;
  fileCustomCatId: string | null;
  onFileCustomCatChange: (newCatId: string | null) => Promise<void>;
  customCategories: CustomCategory[];
  onUploadSuccess?: (file: StoredFile) => void;
  filesBusy?: boolean;
}

interface ActiveUpload {
  id: string;
  fileName: string;
  fileSize: number;
  percent: number;
  loaded: number;
  total: number;
  abortCtrl: AbortController;
  isLarge: boolean;
}

const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB

export const FilesView: React.FC<FilesViewProps> = ({
  files,
  activeFile,
  setActiveFile,
  onSetMediaLightboxFile,
  onDeleteFile,
  notesError,
  notice,
  fileCustomCatId,
  onFileCustomCatChange,
  customCategories,
  onUploadSuccess,
  filesBusy = false,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [largeFileWarning, setLargeFileWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle uploading files with XMLHttpRequest progress & abort capability
  const handleUploadList = (fileList: FileList | File[]) => {
    setUploadError('');
    setLargeFileWarning(null);

    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    // Check if any file > 100MB
    const largeFiles = filesArray.filter((f) => f.size > LARGE_FILE_THRESHOLD);
    if (largeFiles.length > 0) {
      const names = largeFiles.map((f) => `"${f.name}" (${formatBytes(f.size)})`).join(', ');
      setLargeFileWarning(
        `ไฟล์ ${names} มีขนาดใหญ่เกิน 100MB การอัปโหลดและการคำนวณรหัส SHA-256 บนเซิร์ฟเวอร์อาจใช้เวลาสักครู่ กรุณาอย่าปิดหรือรีเฟรชหน้าจอนี้`
      );
    }

    filesArray.forEach((file) => {
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const abortCtrl = new AbortController();

      const newUpload: ActiveUpload = {
        id: uploadId,
        fileName: file.name,
        fileSize: file.size,
        percent: 0,
        loaded: 0,
        total: file.size,
        abortCtrl,
        isLarge: file.size > LARGE_FILE_THRESHOLD,
      };

      setActiveUploads((prev) => [...prev, newUpload]);

      uploadFileWithProgress(file, {
        signal: abortCtrl.signal,
        onProgress: (percent, loaded, total) => {
          setActiveUploads((prev) =>
            prev.map((item) =>
              item.id === uploadId ? { ...item, percent, loaded, total } : item
            )
          );
        },
      })
        .then((uploaded) => {
          setActiveUploads((prev) => prev.filter((item) => item.id !== uploadId));
          if (onUploadSuccess) {
            onUploadSuccess(uploaded);
          }
        })
        .catch((err: unknown) => {
          setActiveUploads((prev) => prev.filter((item) => item.id !== uploadId));
          const msg = err instanceof Error ? err.message : String(err);
          if (msg !== 'การอัปโหลดถูกยกเลิก') {
            setUploadError(`อัปโหลดไฟล์ "${file.name}" ไม่สำเร็จ: ${msg}`);
          }
        });
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleUploadList(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadList(e.target.files);
      e.target.value = '';
    }
  };

  const handleCancelUpload = (uploadId: string) => {
    const target = activeUploads.find((u) => u.id === uploadId);
    if (target) {
      target.abortCtrl.abort();
      setActiveUploads((prev) => prev.filter((u) => u.id !== uploadId));
    }
  };

  return (
    <section className="files-container" aria-label="คลังไฟล์และสื่อ">
      {/* Header Banner */}
      <div className="module-header-banner">
        <div className="banner-icon">📁</div>
        <div className="banner-info">
          <span className="eyebrow">File Storage &amp; Streaming Media</span>
          <h2 className="banner-title">{activeFile ? activeFile.displayName : 'คลังไฟล์และสื่อ'}</h2>
          <p className="banner-subtitle">
            {activeFile
              ? `${formatBytes(activeFile.sizeBytes)} · ${activeFile.mediaType} · อัปโหลดเมื่อ ${formatDate(activeFile.createdAt)}`
              : `${files.length} รายการ · คลังจัดเก็บเอกสาร รูปภาพ วิดีโอ และสื่อพร้อมสตรีมมิ่งสด`}
          </p>
        </div>
        <div className="banner-actions">
          {activeFile ? (
            <>
              <Button
                variant="quiet"
                onClick={() => onSetMediaLightboxFile(activeFile)}
              >
                👁️ ดูตัวอย่างสด
              </Button>
              <a
                className="button button-quiet"
                href={activeFile.downloadUrl}
                download={activeFile.displayName}
              >
                ⬇️ ดาวน์โหลด
              </a>
              <Button
                variant="danger-quiet"
                onClick={() => void onDeleteFile(activeFile)}
              >
                ลบไฟล์
              </Button>
              <Button
                variant="secondary"
                onClick={() => setActiveFile(null)}
              >
                ← ดูไฟล์ทั้งหมด
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              ＋ อัปโหลดไฟล์
            </Button>
          )}
        </div>
      </div>

      {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
      {uploadError && <p className="form-error editor-error" role="alert">{uploadError}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {/* Large File Warning Banner (> 100MB) */}
      {largeFileWarning && (
        <div className="file-large-warning" role="alert">
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <strong>คำเตือน: กำลังประมวลผลไฟล์ขนาดใหญ่</strong>
            <span>{largeFileWarning}</span>
          </div>
          <button
            type="button"
            className="notes-chip-remove"
            style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}
            onClick={() => setLargeFileWarning(null)}
            title="ปิดการแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Uploads with Progress Bar & Cancel Button */}
      {activeUploads.length > 0 && (
        <div className="upload-progress-container" aria-label="สถานะการอัปโหลดไฟล์">
          {activeUploads.map((upload) => (
            <div key={upload.id} className="upload-progress-card">
              <div className="upload-progress-info">
                <div className="upload-progress-title">
                  <span>📄 {upload.fileName}</span>
                  <span style={{ marginLeft: '8px', color: 'var(--pkh-text-muted)', fontSize: '11px' }}>
                    ({formatBytes(upload.loaded)} / {formatBytes(upload.total)})
                  </span>
                </div>
                <div className="upload-progress-bar-wrap">
                  <div
                    className="upload-progress-bar-fill"
                    style={{ width: `${upload.percent}%` }}
                  />
                </div>
                <div className="upload-progress-status">
                  <span>กำลังอัปโหลด... {upload.percent}%</span>
                  {upload.isLarge && <span style={{ color: '#d97706' }}>ไฟล์ขนาดใหญ่กำลังส่งข้อมูล</span>}
                </div>
              </div>
              <Button
                variant="danger-quiet"
                size="sm"
                onClick={() => handleCancelUpload(upload.id)}
                title="ยกเลิกการอัปโหลดไฟล์นี้"
              >
                ✕ ยกเลิก
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden File Input for Picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="visually-hidden"
        onChange={handleFileInputChange}
      />

      {/* Single Active File Detail View */}
      {activeFile ? (
        <article className="file-active-detail">
          <div className="file-detail-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '36px' }}>{fileIcon(activeFile.mediaType, activeFile.displayName)}</span>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: 'var(--pkh-text-primary)' }}>
                  {activeFile.displayName}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
                  {formatBytes(activeFile.sizeBytes)} · {activeFile.mediaType} · อัปโหลดเมื่อ {formatDate(activeFile.createdAt)}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onSetMediaLightboxFile(activeFile)}
            >
              👁️ เล่น/เปิดดูสด
            </Button>
          </div>

          {/* Interactive Preview Stage */}
          <div className="file-preview-stage">
            {activeFile.mediaType.startsWith('image/') ? (
              <img
                src={activeFile.downloadUrl}
                alt={activeFile.displayName}
                loading="lazy"
                decoding="async"
              />
            ) : activeFile.mediaType.startsWith('video/') || activeFile.displayName.endsWith('.mp4') ? (
              <video src={activeFile.downloadUrl} controls playsInline>
                เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ
              </video>
            ) : activeFile.mediaType.startsWith('audio/') || activeFile.displayName.endsWith('.mp3') ? (
              <div style={{ padding: '30px', textAlign: 'center' }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>🎵</span>
                <audio src={activeFile.downloadUrl} controls style={{ width: '320px' }} />
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>
                  {fileIcon(activeFile.mediaType, activeFile.displayName)}
                </span>
                <p>คลิกปุ่ม "เล่น/เปิดดูสด" หรือดาวน์โหลดเพื่อเปิดด้วยโปรแกรมในเครื่อง</p>
              </div>
            )}
          </div>

          {/* Custom Category Selection */}
          {customCategories.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pkh-text-secondary)' }}>
                📁 ผูกกับหมวดหมู่ของฉัน:
              </label>
              <select
                value={fileCustomCatId || ''}
                onChange={(e) => void onFileCustomCatChange(e.target.value || null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--pkh-radius-md)',
                  border: '1px solid var(--pkh-border-default)',
                  background: 'var(--pkh-bg-surface)',
                  color: 'var(--pkh-text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="">-- ไม่ระบุหมวดหมู่ --</option>
                {customCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '↳ ' : ''}{c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </article>
      ) : (
        <>
          {/* Drag & Drop Upload Zone */}
          <div
            className={`file-dropzone ${isDraggingOver ? 'is-dragging-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="ลากและวางไฟล์ที่นี่ หรือคลิกเพื่อเลือกไฟล์"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fileInputRef.current?.click();
              }
            }}
          >
            <div className="file-dropzone-icon">☁️</div>
            <p className="file-dropzone-title">
              {isDraggingOver ? 'ปล่อยไฟล์ที่นี่เพื่ออัปโหลดทันที' : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์'}
            </p>
            <p className="file-dropzone-desc">
              รองรับรูปภาพ, วิดีโอ (สตรีมผ่าน HTTP Range 206), เสียง, PDF, และเอกสารทุกประเภท
            </p>
          </div>

          {/* Files Grid Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--pkh-text-primary)' }}>
              ไฟล์ทั้งหมด ({files.length})
            </h3>
          </div>

          {/* Bento Grid or States */}
          {filesBusy ? (
            <div className="files-bento-grid">
              <Skeleton height={220} borderRadius="16px" />
              <Skeleton height={220} borderRadius="16px" />
              <Skeleton height={220} borderRadius="16px" />
              <Skeleton height={220} borderRadius="16px" />
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon="📁"
              title="ยังไม่มีไฟล์ในคลัง"
              description="ลากไฟล์มาวางที่กล่องด้านบน หรือคลิกปุ่มอัปโหลดเพื่อเริ่มต้นจัดเก็บไฟล์"
              action={
                <Button
                  variant="primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  ＋ อัปโหลดไฟล์แรก
                </Button>
              }
            />
          ) : (
            <div className="files-bento-grid">
              {files.map((file) => {
                const isImage = file.mediaType.startsWith('image/');
                const isVideo =
                  file.mediaType.startsWith('video/') ||
                  file.displayName.endsWith('.mp4') ||
                  file.displayName.endsWith('.webm') ||
                  file.displayName.endsWith('.mov');
                const isAudio =
                  file.mediaType.startsWith('audio/') ||
                  file.displayName.endsWith('.mp3') ||
                  file.displayName.endsWith('.wav');
                const isPdf =
                  file.mediaType === 'application/pdf' ||
                  file.displayName.endsWith('.pdf');

                return (
                  <article
                    key={file.id}
                    className="file-bento-card"
                    onClick={() => setActiveFile(file)}
                  >
                    {/* Thumbnail Zone */}
                    <div className="file-bento-thumb">
                      <span className="file-type-pill">
                        {isVideo ? 'VIDEO' : isImage ? 'IMAGE' : isAudio ? 'AUDIO' : isPdf ? 'PDF' : 'FILE'}
                      </span>

                      {isImage ? (
                        <img
                          src={file.downloadUrl}
                          alt={file.displayName}
                          className="file-bento-img"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="file-bento-placeholder-icon">
                          {fileIcon(file.mediaType, file.displayName)}
                        </span>
                      )}

                      {/* Play overlay for video & audio */}
                      {(isVideo || isAudio || isImage) && (
                        <div className="file-play-overlay">
                          <button
                            type="button"
                            className="file-play-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetMediaLightboxFile(file);
                            }}
                            title="ดูตัวอย่าง / เล่นสด"
                          >
                            {isVideo || isAudio ? '▶' : '🔍'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="file-bento-body">
                      <strong className="file-bento-title" title={file.displayName}>
                        {file.displayName}
                      </strong>
                      <div className="file-bento-meta">
                        <span>{formatBytes(file.sizeBytes)}</span>
                        <span>·</span>
                        <span>{file.mediaType.split('/')[1] || file.mediaType}</span>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="file-bento-footer">
                      <time dateTime={new Date(file.createdAt).toISOString()}>
                        {formatDate(file.createdAt)}
                      </time>
                      <div className="file-bento-actions">
                        <Button
                          variant="quiet"
                          size="sm"
                          style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetMediaLightboxFile(file);
                          }}
                          title="ดูตัวอย่าง"
                        >
                          👁️
                        </Button>
                        <a
                          className="button button-quiet"
                          style={{ padding: '2px 6px', minHeight: '22px', fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}
                          href={file.downloadUrl}
                          download={file.displayName}
                          onClick={(e) => e.stopPropagation()}
                          title="ดาวน์โหลด"
                        >
                          ⬇️
                        </a>
                        <Button
                          variant="danger-quiet"
                          size="sm"
                          style={{ padding: '2px 6px', height: '22px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteFile(file);
                          }}
                          title="ลบไฟล์"
                        >
                          🗑️
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};

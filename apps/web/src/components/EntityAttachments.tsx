import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  listFiles,
  listEntityFiles,
  linkEntityFile,
  unlinkEntityFile,
  uploadFile,
  type AttachmentEntityType,
  type EntityLinkedFile,
  type StoredFile,
} from '../api';
import { fileIcon, formatBytes, errorMessage } from '../lib/formatters';

export interface EntityAttachmentsProps {
  entityType: AttachmentEntityType;
  entityId: string;
  availableFiles: StoredFile[];
  onFilesChanged: () => void;
}

export function EntityAttachments({
  entityType,
  entityId,
  availableFiles,
  onFilesChanged,
}: EntityAttachmentsProps) {
  const [linkedFiles, setLinkedFiles] = useState<EntityLinkedFile[]>([]);
  const [libraryFiles, setLibraryFiles] = useState<StoredFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    listFiles(1, 100)
      .then((page) => {
        if (active) setLibraryFiles(page.files);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listEntityFiles(entityType, entityId)
      .then((items) => {
        if (!active) return;
        setLinkedFiles(items);
        setSelectedFileId('');
        setError('');
        setNotice('');
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  const mergedFiles = [...availableFiles, ...libraryFiles].filter(
    (file, index, all) => all.findIndex((item) => item.id === file.id) === index,
  );
  const attachableFiles = mergedFiles.filter(
    (file) => !linkedFiles.some((linked) => linked.id === file.id),
  );

  async function handleLinkExisting() {
    if (!selectedFileId) {
      setError('กรุณาเลือกไฟล์ที่ต้องการแนบ');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await linkEntityFile(entityType, entityId, selectedFileId);
      setLinkedFiles(result.files);
      setSelectedFileId('');
      setNotice(result.created ? 'แนบไฟล์แล้ว' : 'ไฟล์นี้แนบอยู่แล้ว');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadAndLink(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const uploaded = await uploadFile(file);
      const result = await linkEntityFile(entityType, entityId, uploaded.id);
      setLibraryFiles((current) => (current.some((item) => item.id === uploaded.id) ? current : [...current, uploaded]));
      setLinkedFiles(result.files);
      setNotice('อัปโหลดและแนบไฟล์แล้ว');
      onFilesChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink(fileId: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await unlinkEntityFile(entityType, entityId, fileId);
      setLinkedFiles((current) => current.filter((item) => item.id !== fileId));
      setNotice('เอาไฟล์แนบออกแล้ว (ไฟล์ในคลังยังอยู่ครบ)');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="entity-attachments" aria-label="ไฟล์แนบ">
      <div className="entity-attachments-head">
        <strong>ไฟล์แนบ ({linkedFiles.length})</strong>
        <div className="entity-attachments-controls">
          <select
            aria-label="เลือกไฟล์ที่มีอยู่เพื่อแนบ"
            value={selectedFileId}
            disabled={busy || attachableFiles.length === 0}
            onChange={(event) => setSelectedFileId(event.target.value)}
          >
            <option value="">
              {attachableFiles.length === 0 ? 'ไม่มีไฟล์อื่นให้เลือกแนบ' : 'เลือกไฟล์จากคลัง…'}
            </option>
            {attachableFiles.map((file) => (
              <option value={file.id} key={file.id}>
                {file.displayName} ({formatBytes(file.sizeBytes)})
              </option>
            ))}
          </select>
          <button
            className="button button-quiet"
            type="button"
            disabled={busy || !selectedFileId}
            onClick={() => void handleLinkExisting()}
          >
            แนบไฟล์
          </button>
          <button
            className="button button-quiet"
            type="button"
            disabled={busy}
            onClick={() => uploadInputRef.current?.click()}
          >
            อัปโหลดแล้วแนบ
          </button>
          <input
            ref={uploadInputRef}
            className="visually-hidden"
            type="file"
            aria-label="อัปโหลดไฟล์เพื่อแนบ"
            onChange={(event) => void handleUploadAndLink(event)}
          />
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {linkedFiles.length === 0 ? (
        <p className="sidebar-hint entity-attachments-empty">ยังไม่มีไฟล์แนบกับรายการนี้</p>
      ) : (
        <ul className="entity-attachments-list" aria-label="รายการไฟล์แนบ">
          {linkedFiles.map((file) => (
            <li className="entity-attachment-item" key={file.id}>
              <a
                className="entity-attachment-link"
                href={`/api/files/${encodeURIComponent(file.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="entry-kind file">{fileIcon(file.mediaType, file.displayName)}</span>
                <span>{file.displayName}</span>
                <small>({formatBytes(file.sizeBytes)})</small>
              </a>
              <button
                className="text-button danger-text"
                type="button"
                disabled={busy}
                onClick={() => void handleUnlink(file.id)}
              >
                เอาออก
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

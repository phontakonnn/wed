import { useState, type KeyboardEvent } from 'react';
import { createTag } from '../api';
import './TagSelector.css';

export interface TagSelectorProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  availableTags?: string[];
  placeholder?: string;
  disabled?: boolean;
}

export function TagSelector({
  selectedTags,
  onChange,
  availableTags = [],
  placeholder = 'พิมพ์ชื่อแท็ก เช่น งานด่วน, ส่วนตัว...',
  disabled = false,
}: TagSelectorProps) {
  const [inputVal, setInputVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleAddTag = async () => {
    const raw = inputVal.trim().replace(/^#+/, '');
    if (!raw) return;

    // Check if already selected
    if (selectedTags.some((t) => t.toLowerCase() === raw.toLowerCase())) {
      setInputVal('');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // Call createTag API to persist tag in database
      await createTag(raw);
      onChange([...selectedTags, raw]);
      setInputVal('');
    } catch {
      // If server error, still add tag to local list for flexibility
      onChange([...selectedTags, raw]);
      setInputVal('');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(selectedTags.filter((t) => t !== tagToRemove));
  };

  const handleToggleAvailable = (tag: string) => {
    const clean = tag.replace(/^#+/, '');
    if (selectedTags.includes(clean)) {
      handleRemoveTag(clean);
    } else {
      onChange([...selectedTags, clean]);
    }
  };

  // Filter available tags that are not yet selected
  const unselectedAvailable = availableTags.filter(
    (t) => !selectedTags.some((st) => st.toLowerCase() === t.toLowerCase()),
  );

  return (
    <div className="tag-selector-container">
      {/* Input row */}
      <div className="tag-selector-input-row">
        <input
          type="text"
          className="tag-selector-input"
          placeholder={placeholder}
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || busy}
          maxLength={80}
        />
        <button
          type="button"
          className="tag-selector-add-btn"
          onClick={() => void handleAddTag()}
          disabled={disabled || busy || !inputVal.trim()}
        >
          {busy ? '...' : '＋ เพิ่มแท็ก'}
        </button>
      </div>

      {error && <span className="tag-selector-error">{error}</span>}

      {/* Selected tags chips */}
      {selectedTags.length > 0 && (
        <div className="tag-selector-selected-chips">
          {selectedTags.map((tag) => (
            <span key={tag} className="tag-chip tag-chip-selected">
              #{tag}
              <button
                type="button"
                className="tag-chip-remove"
                onClick={() => handleRemoveTag(tag)}
                title={`ลบแท็ก #${tag}`}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Available tags cloud */}
      {unselectedAvailable.length > 0 && (
        <div className="tag-selector-available-cloud">
          <span className="tag-cloud-label">แท็กที่มีอยู่:</span>
          {unselectedAvailable.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-chip tag-chip-available"
              onClick={() => handleToggleAvailable(tag)}
              title={`คลิกเพื่อติดแท็ก #${tag}`}
              disabled={disabled}
            >
              +#{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

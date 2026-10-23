import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchBucketType, SearchResults, CustomCategory, SavedFilterItem } from '../../api';
import { getSavedFilters, saveFilter, deleteSavedFilter } from '../../api';
import { SEARCH_TYPE_LABELS } from '../../lib/constants';
import { parseSavedFilterCriteria } from '../../lib/validation';
import { formatBytes } from '../../lib/formatters';
import { Skeleton } from '../../components/ui/Skeleton';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  types: SearchBucketType[];
  onToggleType: (type: SearchBucketType) => void;
  onResetFilters: () => void;
  from: string;
  onFromChange: (from: string) => void;
  to: string;
  onToChange: (to: string) => void;
  isBusy: boolean;
  error: string;
  results: SearchResults | null;
  onNavigate: (
    kind: 'note' | 'task' | 'project' | 'goal' | 'person' | 'reminder' | 'bookmark' | 'file' | 'vault' | 'library' | 'category',
    id: string
  ) => void;
  customCategories?: CustomCategory[];
}

interface FlatSearchResult {
  id: string;
  kind: 'note' | 'task' | 'project' | 'goal' | 'person' | 'reminder' | 'bookmark' | 'file' | 'vault' | 'library' | 'category';
  title: string;
  subtitle?: string;
  icon: string;
  badge: string;
}

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({
  isOpen,
  onClose,
  query,
  onQueryChange,
  types,
  onToggleType,
  onResetFilters,
  from,
  onFromChange,
  to,
  onToChange,
  isBusy,
  error,
  results,
  onNavigate,
  customCategories = [],
}) => {
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest');
  const queryClient = useQueryClient();
  const [filterSavedNotice, setFilterSavedNotice] = useState('');

  // Saved filters are server state: cached per session, refetched on open.
  const savedFiltersQuery = useQuery({
    queryKey: ['savedFilters', 'command_search'],
    queryFn: async () => (await getSavedFilters('command_search')).filters,
    enabled: isOpen,
  });
  const savedFiltersList: SavedFilterItem[] = savedFiltersQuery.data ?? [];
  const reloadSavedFilters = () =>
    queryClient.invalidateQueries({ queryKey: ['savedFilters', 'command_search'] });

  const handleSaveCurrentFilter = async () => {
    const name = window.prompt('ตั้งชื่อสำหรับชุดตัวกรองนี้:', query || 'ตัวกรองที่กำหนดเอง');
    if (!name || !name.trim()) return;
    try {
      await saveFilter({
        name: name.trim(),
        filterType: 'command_search',
        criteriaJson: JSON.stringify({ query, types, from, to, sortOrder }),
      });
      setFilterSavedNotice('บันทึกตัวกรองเรียบร้อยแล้ว!');
      setTimeout(() => setFilterSavedNotice(''), 3000);
      void reloadSavedFilters();
    } catch {
      // ignore
    }
  };

  const handleApplySavedFilter = (item: SavedFilterItem) => {
    try {
      const criteria = parseSavedFilterCriteria(item.queryCriteria);
      if (!criteria) return;
      if (criteria.query !== undefined) onQueryChange(criteria.query);
      if (criteria.from !== undefined) onFromChange(criteria.from);
      if (criteria.to !== undefined) onToChange(criteria.to);
      if (criteria.sortOrder) setSortOrder(criteria.sortOrder);
      if (Array.isArray(criteria.types)) {
        onResetFilters();
        criteria.types.forEach((t: SearchBucketType) => onToggleType(t));
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteSavedFilter = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteSavedFilter(id);
      void reloadSavedFilters();
    } catch {
      // ignore
    }
  };

  const [rawIndex, setRawIndex] = useState<number>(0);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset index when modal opens
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setRawIndex(0);
    }
  }

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const isInvalidDateRange = Boolean(from && to && from > to);
  const displayError = isInvalidDateRange
    ? 'ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด'
    : error;

  // Build a single flat list of search results
  const flatResults = useMemo(() => {
    const list: FlatSearchResult[] = [];

    // Client-side Custom Categories match
    if (query.trim() && customCategories.length > 0) {
      const q = query.trim().toLowerCase();
      const matchedCats = customCategories.filter((c) =>
        c.name.toLowerCase().includes(q)
      );
      matchedCats.forEach((c) => {
        list.push({
          id: c.id,
          kind: 'category',
          title: c.name,
          subtitle: 'หมวดหมู่ของฉัน',
          icon: c.icon || '📁',
          badge: 'หมวดหมู่',
        });
      });
    }

    if (!results || isInvalidDateRange) return list;

    // Notes
    (results.notes || []).forEach((n) => {
      list.push({
        id: n.id,
        kind: 'note',
        title: n.title || 'ไม่มีหัวข้อ',
        subtitle: n.content ? n.content.slice(0, 80) : undefined,
        icon: '📝',
        badge: 'โน้ต',
      });
    });

    // Tasks
    (results.tasks || []).forEach((t) => {
      list.push({
        id: t.id,
        kind: 'task',
        title: t.title,
        subtitle: t.dueDate ? `กำหนดส่ง: ${t.dueDate}` : undefined,
        icon: '✓',
        badge: 'งาน',
      });
    });

    // Projects
    (results.projects || []).forEach((p) => {
      list.push({
        id: p.id,
        kind: 'project',
        title: p.name,
        subtitle: p.dueDate ? `กำหนดส่ง: ${p.dueDate}` : undefined,
        icon: '📁',
        badge: 'โปรเจกต์',
      });
    });

    // Goals
    (results.goals || []).forEach((g) => {
      list.push({
        id: g.id,
        kind: 'goal',
        title: g.title,
        subtitle: g.metric ? `เป้าหมาย: ${g.currentValue}/${g.targetValue} ${g.metric}` : undefined,
        icon: '🎯',
        badge: 'เป้าหมาย',
      });
    });

    // People
    (results.people || []).forEach((p) => {
      list.push({
        id: p.id,
        kind: 'person',
        title: p.name,
        subtitle: p.roleLabel || undefined,
        icon: '👤',
        badge: 'บุคคล',
      });
    });

    // Reminders
    (results.reminders || []).forEach((r) => {
      list.push({
        id: r.id,
        kind: 'reminder',
        title: r.title,
        subtitle: r.targetDate ? `เตือนวันที่: ${r.targetDate}` : undefined,
        icon: '🔔',
        badge: 'แจ้งเตือน',
      });
    });

    // Bookmarks
    (results.bookmarks || []).forEach((b) => {
      list.push({
        id: b.id,
        kind: 'bookmark',
        title: b.title,
        subtitle: b.url,
        icon: '🔖',
        badge: 'บุ๊กมาร์ก',
      });
    });

    // Files
    (results.files || []).forEach((f) => {
      list.push({
        id: f.id,
        kind: 'file',
        title: f.displayName,
        subtitle: `${formatBytes(f.sizeBytes)} · ${f.mediaType}`,
        icon: '📄',
        badge: 'ไฟล์',
      });
    });

    // Vault
    (results.vault || []).forEach((v) => {
      list.push({
        id: v.id,
        kind: 'vault',
        title: v.title,
        subtitle: v.renewalOrExpiryDate ? `หมดอายุ: ${v.renewalOrExpiryDate}` : undefined,
        icon: '🔐',
        badge: 'คลังสำคัญ',
      });
    });

    // Library
    (results.library || []).forEach((l) => {
      list.push({
        id: l.id,
        kind: 'library',
        title: l.title,
        subtitle: l.status || undefined,
        icon: '📚',
        badge: 'ห้องสมุด',
      });
    });

    if (sortOrder === 'oldest') {
      list.reverse();
    } else if (sortOrder === 'az') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'th'));
    }
    return list;
  }, [results, isInvalidDateRange, query, customCategories, sortOrder]);

  // Derived selected index clamped to flatResults length
  const selectedIndex = flatResults.length === 0 ? 0 : Math.min(rawIndex, flatResults.length - 1);

  // Handle Keyboard Navigation: ArrowDown, ArrowUp, Enter, Escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRawIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRawIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[selectedIndex]) {
        const item = flatResults[selectedIndex];
        onNavigate(item.kind, item.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Auto-scroll selected row into view
  useEffect(() => {
    const container = resultsContainerRef.current;
    if (!container) return;
    const selectedEl = container.children[selectedIndex] as HTMLElement | undefined;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="ค้นหารวม PKH Global Command Palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="command-palette-head">
          <span className="command-palette-search-icon" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            className="command-palette-input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ค้นหาโน้ต, งาน, บุ๊กมาร์ก, ไฟล์, หมวดหมู่, คลังสำคัญ..."
            maxLength={120}
          />
          {query && (
            <button
              type="button"
              className="notes-chip-remove"
              onClick={() => onQueryChange('')}
              title="ล้างคำค้น"
              style={{ fontSize: '14px', padding: '4px' }}
            >
              ✕
            </button>
          )}
          <span className="command-palette-esc-badge" aria-hidden="true">ESC</span>
        </div>

        {/* Filter Chips Bar */}
        <div className="command-palette-filters" aria-label="ตัวกรองประเภท">
          <button
            type="button"
            className={`command-palette-chip ${types.length === SEARCH_TYPE_LABELS.length ? 'is-active' : ''}`}
            onClick={onResetFilters}
          >
            ทั้งหมด
          </button>
          {SEARCH_TYPE_LABELS.map(({ type, label }) => {
            const isSelected = types.includes(type) && types.length !== SEARCH_TYPE_LABELS.length;
            return (
              <button
                key={type}
                type="button"
                className={`command-palette-chip ${isSelected ? 'is-active' : ''}`}
                onClick={() => onToggleType(type)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Date Filter Bar & Sort */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '6px 20px', background: 'var(--pkh-bg-subtle)', fontSize: '11px', color: 'var(--pkh-text-muted)' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              ตั้งแต่:
              <input
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                style={{ fontSize: '11px', padding: '1px 4px', borderRadius: '4px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              ถึง:
              <input
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                style={{ fontSize: '11px', padding: '1px 4px', borderRadius: '4px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              เรียง:
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'az')}
                style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--pkh-border-subtle)', background: 'var(--pkh-bg-surface)' }}
              >
                <option value="newest">ใหม่สุด</option>
                <option value="oldest">เก่าสุด</option>
                <option value="az">ก-ฮ (A-Z)</option>
              </select>
            </label>
            <button
              type="button"
              className="text-button"
              style={{ fontSize: '11px', color: 'var(--pkh-primary, #2563eb)', fontWeight: 600, cursor: 'pointer' }}
              onClick={handleSaveCurrentFilter}
              title="บันทึกตัวกรองนี้เป็นชุดโปรด"
            >
              ⭐ บันทึกตัวกรองนี้
            </button>
          </div>
        </div>

        {/* Saved Filters Bar */}
        {savedFiltersList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 20px', background: 'var(--pkh-bg-surface)', borderBottom: '1px solid var(--pkh-border-subtle)', overflowX: 'auto', fontSize: '11px' }}>
            <span style={{ color: 'var(--pkh-text-muted)', whiteSpace: 'nowrap' }}>ชุดที่บันทึกไว้:</span>
            {savedFiltersList.map((sf) => (
              <span
                key={sf.id}
                onClick={() => handleApplySavedFilter(sf)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'var(--pkh-bg-subtle, #f1f5f9)',
                  border: '1px solid var(--pkh-border-subtle)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ⭐ {sf.name}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--pkh-text-muted)' }}
                  onClick={(e) => void handleDeleteSavedFilter(e, sf.id)}
                  title="ลบตัวกรองนี้"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {filterSavedNotice && (
          <div style={{ padding: '4px 20px', background: '#f0fdf4', color: '#166534', fontSize: '11px' }}>
            ✓ {filterSavedNotice}
          </div>
        )}

        {/* Error message */}
        {displayError && (
          <p className="form-error" role="alert" style={{ margin: '8px 20px' }}>
            {displayError}
          </p>
        )}

        {/* Results Container */}
        <div className="command-palette-results" ref={resultsContainerRef}>
          {isBusy ? (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton height={42} borderRadius="8px" />
              <Skeleton height={42} borderRadius="8px" />
              <Skeleton height={42} borderRadius="8px" />
            </div>
          ) : flatResults.length > 0 ? (
            flatResults.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  className={`command-result-row ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onNavigate(item.kind, item.id)}
                  onMouseEnter={() => setRawIndex(index)}
                >
                  <div className="command-result-left">
                    <span className="command-result-icon">{item.icon}</span>
                    <div className="command-result-main">
                      <strong className="command-result-title">{item.title}</strong>
                      {item.subtitle && (
                        <span className="command-result-sub">{item.subtitle}</span>
                      )}
                    </div>
                  </div>
                  <div className="command-result-right">
                    <span className="command-result-badge">{item.badge}</span>
                    <span className="command-enter-badge" aria-hidden="true">↵</span>
                  </div>
                </button>
              );
            })
          ) : query ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>🔍</span>
              <strong style={{ display: 'block', color: 'var(--pkh-text-primary)', marginBottom: '4px' }}>
                ไม่พบผลลัพธ์สำหรับ "{query}"
              </strong>
              <span style={{ fontSize: '12px' }}>ลองเปลี่ยนคำค้นหา หรือคลิกปุ่มตัวกรองด้านบน</span>
            </div>
          ) : (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--pkh-text-muted)' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>⚡</span>
              <strong style={{ display: 'block', color: 'var(--pkh-text-primary)', marginBottom: '4px' }}>
                ค้นหาทุกสิ่งใน PKH Life OS
              </strong>
              <span style={{ fontSize: '12px' }}>พิมพ์เพื่อค้นหาโน้ต, งาน, บุ๊กมาร์ก, เอกสาร หรือหมวดหมู่</span>
            </div>
          )}
        </div>

        {/* Footer with keyboard shortcuts hints */}
        <div className="command-palette-footer">
          <div className="command-palette-shortcuts">
            <span className="command-shortcut-hint">
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              <span>เลือก</span>
            </span>
            <span className="command-shortcut-hint">
              <kbd>↵</kbd>
              <span>เปิด</span>
            </span>
            <span className="command-shortcut-hint">
              <kbd>esc</kbd>
              <span>ปิด</span>
            </span>
          </div>
          <span>
            {flatResults.length > 0 && `${flatResults.length} ผลลัพธ์`}
          </span>
        </div>
      </div>
    </div>
  );
};

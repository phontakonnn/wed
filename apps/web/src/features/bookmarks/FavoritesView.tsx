import React from 'react';
import type { Favorite } from '../../api';
import type { AllEntry } from '../../types';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export interface FavoritesViewProps {
  favorites: Favorite[];
  activeFavorite: Favorite | null;
  setActiveFavorite: (fav: Favorite | null) => void;
  onOpenFavorite: (fav: Favorite) => Promise<void>;
  onToggleFavorite: (itemType: 'note' | 'bookmark', itemId: string, current: boolean) => Promise<void>;
  favoriteBusy: boolean;
  notesError: string;
  notice: string;
  viewTitle: string;
  listLength: number;
  allEntries: AllEntry[];
  onSelectAllEntry: (entry: AllEntry) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  favorites,
  activeFavorite,
  setActiveFavorite,
  onOpenFavorite,
  onToggleFavorite,
  favoriteBusy,
  notesError,
  notice,
  viewTitle,
  listLength,
  allEntries,
  onSelectAllEntry,
}) => {
  return (
    <section className="bookmarks-container" aria-label="รายละเอียดรายการโปรด">
      <div className="module-header-banner">
        <div className="banner-icon">⭐</div>
        <div className="banner-info">
          <span className="eyebrow">Starred Favorites</span>
          <h2 className="banner-title">รายการโปรด</h2>
          <p className="banner-subtitle">
            {favorites.length} รายการที่คุณติดดาวไว้ · เข้าถึงโน้ตและบุ๊กมาร์กสำคัญได้อย่างรวดเร็ว
          </p>
        </div>
        {activeFavorite && (
          <div className="banner-actions">
            <Button
              variant="primary"
              onClick={() => void onOpenFavorite(activeFavorite)}
            >
              เปิดรายการ
            </Button>
            <Button
              variant="danger-quiet"
              disabled={favoriteBusy}
              onClick={() => void onToggleFavorite(activeFavorite.itemType, activeFavorite.itemId, true)}
            >
              นำออก ★
            </Button>
            <Button
              variant="secondary"
              onClick={() => setActiveFavorite(null)}
            >
              ← ดูทั้งหมด
            </Button>
          </div>
        )}
      </div>

      {notesError && <p className="form-error editor-error" role="alert">{notesError}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      {activeFavorite ? (
        <article className="file-active-detail">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="bookmark-domain-pill" style={{ marginBottom: '8px' }}>
                {activeFavorite.itemType === 'note' ? '📝 โน้ต' : '🔖 บุ๊กมาร์ก'}
              </span>
              <h2 style={{ margin: '8px 0', fontSize: '20px', color: 'var(--pkh-text-primary)' }}>
                {activeFavorite.title}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--pkh-text-secondary)' }}>
                {activeFavorite.subtitle || 'ไม่มีรายละเอียด'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '20px', paddingTop: '16px', borderTop: '1px solid var(--pkh-border-subtle)', fontSize: '12px', color: 'var(--pkh-text-muted)' }}>
            <span>แก้ไขล่าสุด: {formatDate(activeFavorite.updatedAt)}</span>
          </div>
        </article>
      ) : (
        <>
          {allEntries.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <span className="eyebrow">{viewTitle} ({listLength} รายการ)</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {allEntries.slice(0, 5).map((entry) => (
                  <Button
                    key={entry.id}
                    variant="quiet"
                    size="sm"
                    onClick={() => onSelectAllEntry(entry)}
                  >
                    {entry.title}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {favorites.length === 0 ? (
            <EmptyState
              icon="⭐"
              title="ยังไม่มีรายการโปรด"
              description="กดไอคอนดาว (★) บนโน้ตหรือบุ๊กมาร์ก เพื่อปักหมุดไว้ในหน้านี้เพื่อการเข้าถึงที่รวดเร็ว"
            />
          ) : (
            <div className="bookmarks-grid">
              {favorites.map((fav) => (
                <article
                  key={`${fav.itemType}-${fav.itemId}`}
                  className="bookmark-card-modern"
                  onClick={() => void onOpenFavorite(fav)}
                >
                  <div>
                    <div className="bookmark-card-top">
                      <span className="bookmark-domain-pill">
                        {fav.itemType === 'note' ? '📝 โน้ต' : '🔖 บุ๊กมาร์ก'}
                      </span>
                    </div>

                    <h4 className="bookmark-card-title">{fav.title}</h4>
                    {fav.subtitle && (
                      <p className="bookmark-card-desc">{fav.subtitle}</p>
                    )}
                  </div>

                  <div className="bookmark-card-footer">
                    <time dateTime={new Date(fav.updatedAt).toISOString()}>
                      {formatDate(fav.updatedAt)}
                    </time>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button
                        variant="danger-quiet"
                        size="sm"
                        style={{ padding: '2px 8px', height: '22px', fontSize: '11px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onToggleFavorite(fav.itemType, fav.itemId, true);
                        }}
                      >
                        นำออก ★
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

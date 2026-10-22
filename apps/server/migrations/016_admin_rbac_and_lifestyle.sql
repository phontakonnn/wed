-- Migration 016: Admin RBAC & Lifestyle Modules (Watchlist, Shopping, Travel)

-- 1. Add RBAC & profile columns to users
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- Ensure default admin user has admin role
UPDATE users SET role = 'admin', display_name = 'ผู้ดูแลระบบ' WHERE username = 'admin';

-- 2. Watchlist items (หนัง/ซีรีส์/อนิเมะ/รายการ)
CREATE TABLE IF NOT EXISTS watchlist_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'movie',
  platform TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'want_to_watch',
  rating INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS watchlist_items_owner_idx ON watchlist_items(owner_id);
CREATE INDEX IF NOT EXISTS watchlist_items_status_idx ON watchlist_items(status);

-- 3. Shopping items (ของใช้ที่ต้องซื้อ)
CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'household',
  quantity INTEGER NOT NULL DEFAULT 1,
  estimated_price REAL NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'to_buy',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shopping_items_owner_idx ON shopping_items(owner_id);
CREATE INDEX IF NOT EXISTS shopping_items_status_idx ON shopping_items(status);

-- 4. Travel places (สถานที่เที่ยวที่อยากไป)
CREATE TABLE IF NOT EXISTS travel_places (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'nature',
  location TEXT NOT NULL DEFAULT '',
  map_url TEXT NOT NULL DEFAULT '',
  estimated_budget REAL NOT NULL DEFAULT 0,
  planned_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'wishlist',
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS travel_places_owner_idx ON travel_places(owner_id);
CREATE INDEX IF NOT EXISTS travel_places_status_idx ON travel_places(status);

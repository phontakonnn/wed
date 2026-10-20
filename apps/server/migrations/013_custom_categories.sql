-- Migration 013: Custom Categories & Spaces
-- Allows users to create dynamic categories/spaces with icons, colors, and hierarchical subcategories.
-- Links notes, tasks, bookmarks, files, vault items, and library items to custom categories.

CREATE TABLE custom_categories (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  icon        TEXT NOT NULL DEFAULT '📁',
  color       TEXT NOT NULL DEFAULT '#3f7658',
  parent_id   TEXT REFERENCES custom_categories(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX custom_categories_owner_idx ON custom_categories(owner_id, sort_order, created_at);
CREATE INDEX custom_categories_parent_idx ON custom_categories(owner_id, parent_id);

-- Direct custom_category_id columns on core tables for fast lookup
ALTER TABLE notes ADD COLUMN custom_category_id TEXT REFERENCES custom_categories(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN custom_category_id TEXT REFERENCES custom_categories(id) ON DELETE SET NULL;
ALTER TABLE bookmarks ADD COLUMN custom_category_id TEXT REFERENCES custom_categories(id) ON DELETE SET NULL;
ALTER TABLE library_items ADD COLUMN custom_category_id TEXT REFERENCES custom_categories(id) ON DELETE SET NULL;
ALTER TABLE vault_items ADD COLUMN custom_category_id TEXT REFERENCES custom_categories(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN custom_category_id TEXT REFERENCES custom_categories(id) ON DELETE SET NULL;

-- Junction table for many-to-many or multi-categorization support
CREATE TABLE custom_category_items (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES custom_categories(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL CHECK (item_type IN ('note', 'task', 'bookmark', 'library', 'vault', 'file')),
  item_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (category_id, item_type, item_id)
);

CREATE INDEX custom_cat_items_owner_cat_idx ON custom_category_items(owner_id, category_id);
CREATE INDEX custom_cat_items_owner_item_idx ON custom_category_items(owner_id, item_type, item_id);

-- Migration 021: Universal Trash, Custom Data Types & Records, Favorites & Collections, Support Tickets

-- 1. Universal Soft-Delete columns
ALTER TABLE tasks ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE projects ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE goals ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE people ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE files ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE bookmarks ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE vault_items ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE library_items ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE watchlist_items ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE shopping_items ADD COLUMN deleted_at INTEGER DEFAULT NULL;
ALTER TABLE travel_places ADD COLUMN deleted_at INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS tasks_owner_deleted_idx ON tasks(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS projects_owner_deleted_idx ON projects(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS goals_owner_deleted_idx ON goals(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS people_owner_deleted_idx ON people(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS files_owner_deleted_idx ON files(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS bookmarks_owner_deleted_idx ON bookmarks(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS vault_items_owner_deleted_idx ON vault_items(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS library_items_owner_deleted_idx ON library_items(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS watchlist_items_owner_deleted_idx ON watchlist_items(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS shopping_items_owner_deleted_idx ON shopping_items(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS travel_places_owner_deleted_idx ON travel_places(owner_id, deleted_at);

-- 2. Custom Data Types & Records
CREATE TABLE IF NOT EXISTS custom_data_types (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Folder',
  color TEXT NOT NULL DEFAULT '#3B82F6',
  category TEXT NOT NULL DEFAULT 'general',
  is_shared INTEGER NOT NULL DEFAULT 0,
  fields_schema TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS custom_data_types_owner_idx ON custom_data_types(owner_id, deleted_at);

CREATE TABLE IF NOT EXISTS custom_data_records (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_id TEXT NOT NULL REFERENCES custom_data_types(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS custom_data_records_owner_type_idx ON custom_data_records(owner_id, type_id, deleted_at);

-- 3. Favorite Collections & Universal Favorites
CREATE TABLE IF NOT EXISTS favorite_collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'FolderHeart',
  color TEXT NOT NULL DEFAULT '#EC4899',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS favorite_collections_owner_idx ON favorite_collections(owner_id);

DROP TRIGGER IF EXISTS favorites_target_owner_insert;
DROP TRIGGER IF EXISTS favorites_note_delete;
DROP TRIGGER IF EXISTS favorites_bookmark_delete;

CREATE TABLE favorites_new (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  collection_id TEXT REFERENCES favorite_collections(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, item_type, item_id)
);

INSERT INTO favorites_new (owner_id, item_type, item_id, created_at)
  SELECT owner_id, item_type, item_id, created_at FROM favorites;

DROP TABLE favorites;
ALTER TABLE favorites_new RENAME TO favorites;

CREATE INDEX favorites_owner_created_idx ON favorites(owner_id, created_at DESC, item_id);
CREATE INDEX favorites_owner_collection_idx ON favorites(owner_id, collection_id);

CREATE TRIGGER IF NOT EXISTS favorites_target_owner_insert
BEFORE INSERT ON favorites
WHEN (
  NEW.item_type = 'note'
  AND NOT EXISTS (SELECT 1 FROM notes WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'bookmark'
  AND NOT EXISTS (SELECT 1 FROM bookmarks WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'task'
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'project'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'goal'
  AND NOT EXISTS (SELECT 1 FROM goals WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'person'
  AND NOT EXISTS (SELECT 1 FROM people WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'file'
  AND NOT EXISTS (SELECT 1 FROM files WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'vault'
  AND NOT EXISTS (SELECT 1 FROM vault_items WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'library'
  AND NOT EXISTS (SELECT 1 FROM library_items WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'watchlist'
  AND NOT EXISTS (SELECT 1 FROM watchlist_items WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'shopping'
  AND NOT EXISTS (SELECT 1 FROM shopping_items WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'travel'
  AND NOT EXISTS (SELECT 1 FROM travel_places WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'custom_record'
  AND NOT EXISTS (SELECT 1 FROM custom_data_records WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'favorite target owner mismatch');
END;

CREATE TRIGGER IF NOT EXISTS favorites_note_delete
AFTER DELETE ON notes
BEGIN
  DELETE FROM favorites WHERE item_type = 'note' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_bookmark_delete
AFTER DELETE ON bookmarks
BEGIN
  DELETE FROM favorites WHERE item_type = 'bookmark' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_task_delete
AFTER DELETE ON tasks
BEGIN
  DELETE FROM favorites WHERE item_type = 'task' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_project_delete
AFTER DELETE ON projects
BEGIN
  DELETE FROM favorites WHERE item_type = 'project' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_goal_delete
AFTER DELETE ON goals
BEGIN
  DELETE FROM favorites WHERE item_type = 'goal' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_person_delete
AFTER DELETE ON people
BEGIN
  DELETE FROM favorites WHERE item_type = 'person' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_file_delete
AFTER DELETE ON files
BEGIN
  DELETE FROM favorites WHERE item_type = 'file' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_vault_delete
AFTER DELETE ON vault_items
BEGIN
  DELETE FROM favorites WHERE item_type = 'vault' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_library_delete
AFTER DELETE ON library_items
BEGIN
  DELETE FROM favorites WHERE item_type = 'library' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_watchlist_delete
AFTER DELETE ON watchlist_items
BEGIN
  DELETE FROM favorites WHERE item_type = 'watchlist' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_shopping_delete
AFTER DELETE ON shopping_items
BEGIN
  DELETE FROM favorites WHERE item_type = 'shopping' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_travel_delete
AFTER DELETE ON travel_places
BEGIN
  DELETE FROM favorites WHERE item_type = 'travel' AND item_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS favorites_custom_record_delete
AFTER DELETE ON custom_data_records
BEGIN
  DELETE FROM favorites WHERE item_type = 'custom_record' AND item_id = OLD.id;
END;

-- 4. Support Tickets & Replies
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_ref TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL DEFAULT 'user',
  message TEXT NOT NULL,
  attachment_file_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_idx ON support_ticket_replies(ticket_id, created_at ASC);

-- Batch 5A: Personal Vault (documents, assets, recurring bills) and Knowledge Library & SOPs.
-- Both tables are owner-scoped like every other module; `entity_files` gains two entity types.

CREATE TABLE vault_items (
  id                      TEXT PRIMARY KEY,
  owner_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  category                TEXT NOT NULL DEFAULT 'เอกสาร & ประกัน'
                          CHECK (category IN ('เอกสาร & ประกัน', 'ทรัพย์สิน & บ้าน', 'รอบบิลรายเดือน')),
  -- Policy numbers, serials, access codes the user wants to copy quickly.
  key_value               TEXT NOT NULL DEFAULT '',
  physical_location       TEXT NOT NULL DEFAULT '',
  -- Renewal / expiry / billing cut-off day. NULL means "no date", which is a real state here:
  -- a physical asset such as a bicycle has no renewal date at all.
  renewal_or_expiry_date  TEXT,
  amount_text             TEXT NOT NULL DEFAULT '',
  notes                   TEXT NOT NULL DEFAULT '',
  is_favorite             INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  CHECK (renewal_or_expiry_date IS NULL OR renewal_or_expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

CREATE INDEX vault_items_category_idx ON vault_items(owner_id, category);
CREATE INDEX vault_items_renewal_idx ON vault_items(owner_id, renewal_or_expiry_date);
CREATE INDEX vault_items_updated_idx ON vault_items(owner_id, updated_at DESC);

CREATE TABLE library_items (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'คู่มือชีวิต & SOP'
                      CHECK (category IN ('คู่มือชีวิต & SOP', 'หนังสือ & คอร์สเรียน', 'โพยคำสั่ง & สูตร')),
  status              TEXT NOT NULL DEFAULT 'ใช้งานประจำ'
                      CHECK (status IN ('ใช้งานประจำ', 'กำลังศึกษา', 'สรุปจบแล้ว')),
  source_url_or_author TEXT NOT NULL DEFAULT '',
  key_takeaways       TEXT NOT NULL DEFAULT '',
  content             TEXT NOT NULL DEFAULT '',
  is_favorite         INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX library_items_category_idx ON library_items(owner_id, category);
CREATE INDEX library_items_status_idx ON library_items(owner_id, status);
CREATE INDEX library_items_updated_idx ON library_items(owner_id, updated_at DESC);

-- `entity_files` restricts entity_type with a CHECK, and SQLite cannot alter a CHECK in place.
-- Rebuild the table (copy → drop → rename) and recreate every index and trigger that lived on it.
CREATE TABLE entity_files_v12 (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
              CHECK (entity_type IN ('note', 'task', 'project', 'person', 'bookmark', 'vault', 'library')),
  entity_id   TEXT NOT NULL,
  file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE (entity_type, entity_id, file_id)
);

INSERT INTO entity_files_v12 (id, owner_id, entity_type, entity_id, file_id, created_at)
SELECT id, owner_id, entity_type, entity_id, file_id, created_at FROM entity_files;

-- Triggers that live on other tables still point at `entity_files`, and SQLite refuses to drop a
-- table they reference. Remove them here and recreate them below; the triggers defined ON
-- `entity_files` itself disappear with the table.
DROP TRIGGER entity_files_task_delete;
DROP TRIGGER entity_files_project_delete;
DROP TRIGGER entity_files_person_delete;
DROP TRIGGER entity_files_bookmark_delete;

DROP TABLE entity_files;

ALTER TABLE entity_files_v12 RENAME TO entity_files;

CREATE INDEX entity_files_owner_entity_idx ON entity_files(owner_id, entity_type, entity_id);
CREATE INDEX entity_files_file_idx ON entity_files(file_id);
CREATE INDEX entity_files_owner_created_idx ON entity_files(owner_id, created_at DESC);

CREATE TRIGGER entity_files_note_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'note' AND (
  NOT EXISTS (SELECT 1 FROM notes n WHERE n.id = NEW.entity_id AND n.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_task_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'task' AND (
  NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = NEW.entity_id AND t.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_project_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'project' AND (
  NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.entity_id AND p.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_person_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'person' AND (
  NOT EXISTS (SELECT 1 FROM people p WHERE p.id = NEW.entity_id AND p.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_bookmark_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'bookmark' AND (
  NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.id = NEW.entity_id AND b.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_vault_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'vault' AND (
  NOT EXISTS (SELECT 1 FROM vault_items v WHERE v.id = NEW.entity_id AND v.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_library_insert
BEFORE INSERT ON entity_files
WHEN NEW.entity_type = 'library' AND (
  NOT EXISTS (SELECT 1 FROM library_items l WHERE l.id = NEW.entity_id AND l.owner_id = NEW.owner_id)
  OR NOT EXISTS (SELECT 1 FROM files f WHERE f.id = NEW.file_id AND f.owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'entity/file owner mismatch');
END;

CREATE TRIGGER entity_files_update_guard
BEFORE UPDATE ON entity_files
WHEN NEW.owner_id <> OLD.owner_id OR NEW.entity_type <> OLD.entity_type OR NEW.entity_id <> OLD.entity_id
BEGIN
  SELECT RAISE(ABORT, 'entity/file link is immutable');
END;

-- Hard-deleting an entity removes its links. Notes are soft-deleted, so their links survive a trash
-- restore on purpose; the file itself is never removed by an entity deletion.
CREATE TRIGGER entity_files_task_delete AFTER DELETE ON tasks
BEGIN
  DELETE FROM entity_files WHERE entity_type = 'task' AND entity_id = OLD.id;
END;

CREATE TRIGGER entity_files_project_delete AFTER DELETE ON projects
BEGIN
  DELETE FROM entity_files WHERE entity_type = 'project' AND entity_id = OLD.id;
END;

CREATE TRIGGER entity_files_person_delete AFTER DELETE ON people
BEGIN
  DELETE FROM entity_files WHERE entity_type = 'person' AND entity_id = OLD.id;
END;

CREATE TRIGGER entity_files_bookmark_delete AFTER DELETE ON bookmarks
BEGIN
  DELETE FROM entity_files WHERE entity_type = 'bookmark' AND entity_id = OLD.id;
END;

CREATE TRIGGER entity_files_vault_delete AFTER DELETE ON vault_items
BEGIN
  DELETE FROM entity_files WHERE entity_type = 'vault' AND entity_id = OLD.id;
END;

CREATE TRIGGER entity_files_library_delete AFTER DELETE ON library_items
BEGIN
  DELETE FROM entity_files WHERE entity_type = 'library' AND entity_id = OLD.id;
END;

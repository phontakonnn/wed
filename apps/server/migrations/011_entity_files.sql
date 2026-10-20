CREATE TABLE entity_files (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
              CHECK (entity_type IN ('note', 'task', 'project', 'person', 'bookmark')),
  entity_id   TEXT NOT NULL,
  file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE (entity_type, entity_id, file_id)
);

CREATE INDEX entity_files_owner_entity_idx ON entity_files(owner_id, entity_type, entity_id);
CREATE INDEX entity_files_file_idx ON entity_files(file_id);
CREATE INDEX entity_files_owner_created_idx ON entity_files(owner_id, created_at DESC);

-- `entity_id` is polymorphic, so a single foreign key cannot validate it. Each type gets its own
-- trigger instead: the entity must exist, it must belong to the same owner, and the file must too.
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

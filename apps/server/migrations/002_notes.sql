CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  content TEXT NOT NULL CHECK (length(content) <= 100000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX notes_owner_updated_idx
  ON notes(owner_id, updated_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE VIRTUAL TABLE notes_fts USING fts5(
  title,
  content,
  note_id UNINDEXED,
  owner_id UNINDEXED
);

CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO notes_fts(rowid, title, content, note_id, owner_id)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.id, NEW.owner_id);
END;

CREATE TRIGGER notes_fts_update AFTER UPDATE ON notes
BEGIN
  DELETE FROM notes_fts WHERE rowid = OLD.rowid;
  INSERT INTO notes_fts(rowid, title, content, note_id, owner_id)
    SELECT NEW.rowid, NEW.title, NEW.content, NEW.id, NEW.owner_id
    WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes
BEGIN
  DELETE FROM notes_fts WHERE rowid = OLD.rowid;
END;

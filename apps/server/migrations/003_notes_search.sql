CREATE VIRTUAL TABLE notes_fts_trigram USING fts5(
  title,
  content,
  note_id UNINDEXED,
  owner_id UNINDEXED,
  tokenize = 'trigram'
);

INSERT INTO notes_fts_trigram (rowid, title, content, note_id, owner_id)
SELECT rowid, nfc(title), nfc(content), id, owner_id
FROM notes
WHERE deleted_at IS NULL;

CREATE TRIGGER notes_fts_trigram_insert AFTER INSERT ON notes
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO notes_fts_trigram (rowid, title, content, note_id, owner_id)
  VALUES (NEW.rowid, nfc(NEW.title), nfc(NEW.content), NEW.id, NEW.owner_id);
END;

CREATE TRIGGER notes_fts_trigram_update AFTER UPDATE ON notes
BEGIN
  DELETE FROM notes_fts_trigram WHERE rowid = OLD.rowid;
  INSERT INTO notes_fts_trigram (rowid, title, content, note_id, owner_id)
    SELECT NEW.rowid, nfc(NEW.title), nfc(NEW.content), NEW.id, NEW.owner_id
    WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER notes_fts_trigram_delete AFTER DELETE ON notes
BEGIN
  DELETE FROM notes_fts_trigram WHERE rowid = OLD.rowid;
END;

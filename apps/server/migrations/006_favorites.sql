CREATE TABLE favorites (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('note', 'bookmark')),
  item_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, item_type, item_id)
);

CREATE INDEX favorites_owner_created_idx ON favorites(owner_id, created_at DESC, item_id);

CREATE TRIGGER favorites_target_owner_insert
BEFORE INSERT ON favorites
WHEN (
  NEW.item_type = 'note'
  AND NOT EXISTS (SELECT 1 FROM notes WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
) OR (
  NEW.item_type = 'bookmark'
  AND NOT EXISTS (SELECT 1 FROM bookmarks WHERE id = NEW.item_id AND owner_id = NEW.owner_id)
)
BEGIN
  SELECT RAISE(ABORT, 'favorite target owner mismatch');
END;

CREATE TRIGGER favorites_note_delete
AFTER DELETE ON notes
BEGIN
  DELETE FROM favorites WHERE item_type = 'note' AND item_id = OLD.id;
END;

CREATE TRIGGER favorites_bookmark_delete
AFTER DELETE ON bookmarks
BEGIN
  DELETE FROM favorites WHERE item_type = 'bookmark' AND item_id = OLD.id;
END;

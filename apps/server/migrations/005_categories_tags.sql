CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_id, name COLLATE NOCASE)
);

CREATE INDEX categories_owner_name_idx ON categories(owner_id, name COLLATE NOCASE);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_id, name COLLATE NOCASE)
);

CREATE INDEX tags_owner_name_idx ON tags(owner_id, name COLLATE NOCASE);

CREATE TABLE note_categories (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, category_id)
);

CREATE INDEX note_categories_owner_category_idx ON note_categories(owner_id, category_id, note_id);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX note_tags_owner_tag_idx ON note_tags(owner_id, tag_id, note_id);

CREATE TRIGGER note_categories_owner_insert
BEFORE INSERT ON note_categories
WHEN NOT EXISTS (
  SELECT 1 FROM notes n
  JOIN categories c ON c.id = NEW.category_id
  WHERE n.id = NEW.note_id AND n.owner_id = NEW.owner_id AND c.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'note/category owner mismatch');
END;

CREATE TRIGGER note_categories_owner_update
BEFORE UPDATE ON note_categories
WHEN NOT EXISTS (
  SELECT 1 FROM notes n
  JOIN categories c ON c.id = NEW.category_id
  WHERE n.id = NEW.note_id AND n.owner_id = NEW.owner_id AND c.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'note/category owner mismatch');
END;

CREATE TRIGGER note_tags_owner_insert
BEFORE INSERT ON note_tags
WHEN NOT EXISTS (
  SELECT 1 FROM notes n
  JOIN tags t ON t.id = NEW.tag_id
  WHERE n.id = NEW.note_id AND n.owner_id = NEW.owner_id AND t.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'note/tag owner mismatch');
END;

CREATE TRIGGER note_tags_owner_update
BEFORE UPDATE ON note_tags
WHEN NOT EXISTS (
  SELECT 1 FROM notes n
  JOIN tags t ON t.id = NEW.tag_id
  WHERE n.id = NEW.note_id AND n.owner_id = NEW.owner_id AND t.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'note/tag owner mismatch');
END;

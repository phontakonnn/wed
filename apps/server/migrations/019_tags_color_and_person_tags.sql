-- Migration 019: Tags color and person_tags relationship

-- 1. Add color column to tags
ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6';

-- 2. Create person_tags mapping table
CREATE TABLE IF NOT EXISTS person_tags (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (person_id, tag_id)
);

CREATE INDEX IF NOT EXISTS person_tags_owner_tag_idx ON person_tags(owner_id, tag_id, person_id);
CREATE INDEX IF NOT EXISTS person_tags_person_idx ON person_tags(person_id);

-- 3. Owner integrity trigger for person_tags
CREATE TRIGGER IF NOT EXISTS person_tags_owner_insert
BEFORE INSERT ON person_tags
WHEN NOT EXISTS (
  SELECT 1 FROM people p
  JOIN tags t ON t.id = NEW.tag_id
  WHERE p.id = NEW.person_id AND p.owner_id = NEW.owner_id AND t.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'person/tag owner mismatch');
END;

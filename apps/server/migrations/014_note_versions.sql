-- Migration 014: Note Versions (Revision History)
-- Stores previous versions of notes before edits or restores, enabling version tracking and recovery.

CREATE TABLE IF NOT EXISTS note_versions (
  id              TEXT PRIMARY KEY,
  note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (note_id, version_number)
);

CREATE INDEX IF NOT EXISTS note_versions_note_idx ON note_versions(note_id, version_number DESC);
CREATE INDEX IF NOT EXISTS note_versions_owner_idx ON note_versions(owner_id, note_id);

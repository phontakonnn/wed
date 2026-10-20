CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  url TEXT NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX bookmarks_owner_updated_idx
  ON bookmarks(owner_id, updated_at DESC, id);

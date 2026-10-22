CREATE TABLE people (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  relationship_group TEXT NOT NULL CHECK (relationship_group IN ('family', 'partner', 'friend')),
  role_label TEXT NOT NULL DEFAULT '' CHECK (length(role_label) <= 80),
  avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  avatar_preset TEXT CHECK (avatar_preset IS NULL OR length(avatar_preset) <= 40),
  birthday_or_anniversary TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  favorites_and_likes TEXT NOT NULL DEFAULT '',
  allergies_and_medical TEXT NOT NULL DEFAULT '',
  gift_ideas_and_sizes TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX people_owner_group_idx ON people(owner_id, relationship_group, name COLLATE NOCASE);
CREATE INDEX people_owner_name_idx ON people(owner_id, name COLLATE NOCASE);

CREATE TABLE note_people (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, person_id)
);

CREATE INDEX note_people_owner_person_idx ON note_people(owner_id, person_id, note_id);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  target_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('birthday', 'anniversary', 'health', 'backup', 'other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  linked_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
  notify_days_before INTEGER NOT NULL DEFAULT 7 CHECK (notify_days_before BETWEEN 0 AND 365),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX reminders_owner_date_idx ON reminders(owner_id, is_completed, target_date);

CREATE TABLE life_timeblocks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_date TEXT NOT NULL,
  time_range TEXT NOT NULL CHECK (length(time_range) BETWEEN 1 AND 40),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  life_area TEXT NOT NULL CHECK (life_area IN ('health', 'focus_work', 'family', 'growth', 'other')),
  is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX life_timeblocks_owner_date_idx ON life_timeblocks(owner_id, block_date, time_range);

CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  current_count INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  daily_target INTEGER NOT NULL DEFAULT 1 CHECK (daily_target BETWEEN 1 AND 1000),
  unit TEXT NOT NULL DEFAULT 'ครั้ง' CHECK (length(unit) <= 20),
  streak_days INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_checked_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX habits_owner_created_idx ON habits(owner_id, created_at);

CREATE TRIGGER people_avatar_owner_insert
BEFORE INSERT ON people
WHEN NEW.avatar_file_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM files f WHERE f.id = NEW.avatar_file_id AND f.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'person/avatar owner mismatch');
END;

CREATE TRIGGER people_avatar_owner_update
BEFORE UPDATE ON people
WHEN NEW.avatar_file_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM files f WHERE f.id = NEW.avatar_file_id AND f.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'person/avatar owner mismatch');
END;

CREATE TRIGGER note_people_owner_insert
BEFORE INSERT ON note_people
WHEN NOT EXISTS (
  SELECT 1 FROM notes n
  JOIN people p ON p.id = NEW.person_id
  WHERE n.id = NEW.note_id AND n.owner_id = NEW.owner_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'note/person owner mismatch');
END;

CREATE TRIGGER note_people_owner_update
BEFORE UPDATE ON note_people
WHEN NOT EXISTS (
  SELECT 1 FROM notes n
  JOIN people p ON p.id = NEW.person_id
  WHERE n.id = NEW.note_id AND n.owner_id = NEW.owner_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'note/person owner mismatch');
END;

CREATE TRIGGER reminders_person_owner_insert
BEFORE INSERT ON reminders
WHEN NEW.linked_person_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM people p WHERE p.id = NEW.linked_person_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'reminder/person owner mismatch');
END;

CREATE TRIGGER reminders_person_owner_update
BEFORE UPDATE ON reminders
WHEN NEW.linked_person_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM people p WHERE p.id = NEW.linked_person_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'reminder/person owner mismatch');
END;

CREATE TABLE habit_logs (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id        TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  log_date        TEXT NOT NULL,
  count           INTEGER NOT NULL CHECK (count >= 0),
  target_snapshot INTEGER NOT NULL CHECK (target_snapshot BETWEEN 1 AND 1000),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (habit_id, log_date)
);

CREATE INDEX habit_logs_owner_date_idx ON habit_logs(owner_id, log_date);
CREATE INDEX habit_logs_habit_date_idx ON habit_logs(habit_id, log_date);

CREATE TRIGGER habit_logs_owner_insert
BEFORE INSERT ON habit_logs
WHEN NOT EXISTS (
  SELECT 1 FROM habits h WHERE h.id = NEW.habit_id AND h.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'habit log/habit owner mismatch');
END;

CREATE TRIGGER habit_logs_owner_update
BEFORE UPDATE ON habit_logs
WHEN NOT EXISTS (
  SELECT 1 FROM habits h WHERE h.id = NEW.habit_id AND h.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'habit log/habit owner mismatch');
END;

-- Habit history metadata. `current_count` and `streak_days` become values derived from
-- habit_logs; the pre-migration counters are preserved separately so nothing is lost and
-- nothing unverifiable is presented as history.
ALTER TABLE habits ADD COLUMN tracking_start_date TEXT;
ALTER TABLE habits ADD COLUMN legacy_current_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN legacy_streak_days INTEGER NOT NULL DEFAULT 0;

UPDATE habits
SET legacy_current_count = current_count,
    legacy_streak_days = streak_days,
    tracking_start_date = date('now', 'localtime');

-- The only counter that can be treated as evidence is the one recorded today: it was incremented
-- today. It becomes today's log. No earlier day is invented, and no log is derived from
-- `streak_days`.
INSERT INTO habit_logs (id, owner_id, habit_id, log_date, count, target_snapshot, created_at, updated_at)
SELECT
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) ||
    substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  ),
  owner_id, id, last_checked_date, current_count, daily_target, created_at, updated_at
FROM habits
WHERE last_checked_date = date('now', 'localtime') AND current_count > 0;

-- From here on both values are recomputed from logs on every write. The initial value must agree
-- with the log just written, otherwise a habit that was checked today would display 0 while its log
-- says otherwise.
UPDATE habits SET
  current_count = COALESCE((
    SELECT l.count FROM habit_logs l
    WHERE l.habit_id = habits.id AND l.log_date = date('now', 'localtime')
  ), 0),
  streak_days = CASE WHEN EXISTS (
    SELECT 1 FROM habit_logs l
    WHERE l.habit_id = habits.id AND l.log_date = date('now', 'localtime')
      AND l.count >= l.target_snapshot
  ) THEN 1 ELSE 0 END;

ALTER TABLE reminders ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly', 'yearly'));
ALTER TABLE reminders ADD COLUMN recurrence_anchor_date TEXT;
ALTER TABLE reminders ADD COLUMN snoozed_until TEXT;
ALTER TABLE reminders ADD COLUMN last_completed_at INTEGER;

CREATE INDEX reminders_owner_recurrence_idx ON reminders(owner_id, recurrence, target_date);

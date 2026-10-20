CREATE TABLE goals (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description   TEXT NOT NULL DEFAULT '',
  metric        TEXT NOT NULL DEFAULT '',
  target_value  REAL,
  current_value REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT '' CHECK (length(unit) <= 20),
  horizon       TEXT NOT NULL DEFAULT 'year'
                CHECK (horizon IN ('week', 'month', 'quarter', 'year', 'life')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'achieved', 'dropped')),
  due_date      TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX goals_owner_status_idx ON goals(owner_id, status, horizon);

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  description  TEXT NOT NULL DEFAULT '',
  outcome      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('planned', 'active', 'paused', 'done', 'archived')),
  area         TEXT NOT NULL DEFAULT '' CHECK (length(area) <= 80),
  goal_id      TEXT REFERENCES goals(id) ON DELETE SET NULL,
  start_date   TEXT,
  due_date     TEXT,
  completed_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX projects_owner_status_idx ON projects(owner_id, status, due_date);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  detail       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'doing', 'waiting', 'done', 'cancelled')),
  priority     TEXT NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date     TEXT,
  start_date   TEXT,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  goal_id      TEXT REFERENCES goals(id) ON DELETE SET NULL,
  person_id    TEXT REFERENCES people(id) ON DELETE SET NULL,
  recurrence   TEXT NOT NULL DEFAULT 'none'
               CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  completed_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX tasks_owner_status_due_idx ON tasks(owner_id, status, due_date);
CREATE INDEX tasks_owner_project_idx ON tasks(owner_id, project_id);
CREATE INDEX tasks_owner_goal_idx ON tasks(owner_id, goal_id);
CREATE INDEX tasks_owner_person_idx ON tasks(owner_id, person_id);

CREATE TABLE task_checklist_items (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX task_checklist_task_idx ON task_checklist_items(task_id, position, id);

CREATE TABLE inbox_items (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  kind           TEXT NOT NULL DEFAULT 'text'
                 CHECK (kind IN ('text', 'url', 'file', 'task', 'reminder')),
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'triaged', 'archived')),
  converted_type TEXT CHECK (converted_type IN ('note', 'task', 'project', 'bookmark', 'reminder')),
  converted_id   TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  CHECK ((converted_type IS NULL) = (converted_id IS NULL))
);

CREATE INDEX inbox_owner_status_idx ON inbox_items(owner_id, status, created_at DESC);

CREATE TRIGGER projects_goal_owner_insert
BEFORE INSERT ON projects
WHEN NEW.goal_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM goals g WHERE g.id = NEW.goal_id AND g.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'project/goal owner mismatch');
END;

CREATE TRIGGER projects_goal_owner_update
BEFORE UPDATE ON projects
WHEN NEW.goal_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM goals g WHERE g.id = NEW.goal_id AND g.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'project/goal owner mismatch');
END;

CREATE TRIGGER tasks_project_owner_insert
BEFORE INSERT ON tasks
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'task/project owner mismatch');
END;

CREATE TRIGGER tasks_project_owner_update
BEFORE UPDATE ON tasks
WHEN NEW.project_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'task/project owner mismatch');
END;

CREATE TRIGGER tasks_goal_owner_insert
BEFORE INSERT ON tasks
WHEN NEW.goal_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM goals g WHERE g.id = NEW.goal_id AND g.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'task/goal owner mismatch');
END;

CREATE TRIGGER tasks_goal_owner_update
BEFORE UPDATE ON tasks
WHEN NEW.goal_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM goals g WHERE g.id = NEW.goal_id AND g.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'task/goal owner mismatch');
END;

CREATE TRIGGER tasks_person_owner_insert
BEFORE INSERT ON tasks
WHEN NEW.person_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM people p WHERE p.id = NEW.person_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'task/person owner mismatch');
END;

CREATE TRIGGER tasks_person_owner_update
BEFORE UPDATE ON tasks
WHEN NEW.person_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM people p WHERE p.id = NEW.person_id AND p.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'task/person owner mismatch');
END;

CREATE TRIGGER task_checklist_owner_insert
BEFORE INSERT ON task_checklist_items
WHEN NOT EXISTS (
  SELECT 1 FROM tasks t WHERE t.id = NEW.task_id AND t.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'checklist/task owner mismatch');
END;

CREATE TRIGGER task_checklist_owner_update
BEFORE UPDATE ON task_checklist_items
WHEN NOT EXISTS (
  SELECT 1 FROM tasks t WHERE t.id = NEW.task_id AND t.owner_id = NEW.owner_id
)
BEGIN
  SELECT RAISE(ABORT, 'checklist/task owner mismatch');
END;

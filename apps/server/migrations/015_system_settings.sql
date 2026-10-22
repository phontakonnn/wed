CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
  ('app_title', 'PKH / Life OS', 1700000000000),
  ('app_subtitle', 'ศูนย์รวมข้อมูล บันทึก และการจัดการชีวิตส่วนบุคคล', 1700000000000),
  ('app_logo', '🧠', 1700000000000),
  ('max_upload_size_mb', '50', 1700000000000),
  ('session_idle_timeout_minutes', '10080', 1700000000000),
  ('default_theme', 'system', 1700000000000);

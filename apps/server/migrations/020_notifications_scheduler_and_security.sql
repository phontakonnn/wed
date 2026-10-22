-- Migration 020: Notification Scheduler Deduplication, DND Preferences, OWASP Password Reset OTPs, and System Settings

-- 1. Deduplication key for notifications
ALTER TABLE notifications ADD COLUMN dedup_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(dedup_key);

-- 2. User DND and Notification Category Preferences
ALTER TABLE users ADD COLUMN dnd_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN dnd_start TEXT DEFAULT '22:00';
ALTER TABLE users ADD COLUMN dnd_end TEXT DEFAULT '08:00';
ALTER TABLE users ADD COLUMN notify_birthdays INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_tasks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN notify_shopping INTEGER NOT NULL DEFAULT 1;

-- 3. OWASP ASVS Password Reset OTPs (Hashed, Single-use, Short-expiry, Attempt-locked)
CREATE TABLE IF NOT EXISTS password_reset_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_otps(user_id, used, expires_at);

-- 4. Registration mode setting ('open' or 'invite_only')
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
  ('registration_mode', 'open', 1700000000000);

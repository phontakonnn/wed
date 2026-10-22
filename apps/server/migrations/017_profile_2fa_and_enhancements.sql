-- Migration 017: Profile 2FA, OTP Recovery, Bookmark Categories, and Enhancements

-- 1. Bookmark category
ALTER TABLE bookmarks ADD COLUMN category TEXT NOT NULL DEFAULT 'other';

-- 2. People avatar data URL support
ALTER TABLE people ADD COLUMN avatar_data_url TEXT;

-- 3. User profile, 2FA, and OTP recovery
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN daily_status TEXT;
ALTER TABLE users ADD COLUMN avatar_data_url TEXT;
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_recovery_codes TEXT;
ALTER TABLE users ADD COLUMN otp_code TEXT;
ALTER TABLE users ADD COLUMN otp_expires_at INTEGER;
ALTER TABLE users ADD COLUMN otp_purpose TEXT;

-- 4. Ensure all existing users have role = 'admin' as requested
UPDATE users SET role = 'admin' WHERE role IS NULL OR role = '' OR role = 'user';

-- 5. System setting for admin_gate_pin default
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
  ('admin_gate_pin', '123456', 1700000000000);

-- Add fields needed for native authentication
ALTER TABLE users ADD COLUMN email_verified INTEGER;
ALTER TABLE users ADD COLUMN auth_method TEXT;

-- Make name nullable since some providers (like Apple) might not provide it
-- This requires recreating the table since SQLite doesn't support modifying column constraints directly

-- Create new table with updated schema
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  email_verified INTEGER,
  auth_method TEXT,
  provider TEXT,
  provider_id TEXT,
  last_login_platform TEXT,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Copy existing data
INSERT INTO users_new (
  id, email, name, picture, provider, provider_id, 
  last_login_platform, last_login_at, created_at, updated_at
)
SELECT 
  id, email, name, picture, provider, provider_id,
  last_login_platform, last_login_at, created_at, updated_at
FROM users;

-- Drop old table and rename new one
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
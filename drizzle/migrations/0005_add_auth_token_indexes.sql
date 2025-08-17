-- Migration: Add indexes for auth_tokens table
-- Created: 2025-08-17

-- Composite index for token lookup queries (userId, revoked, accessExpiresAt)
CREATE INDEX IF NOT EXISTS "auth_tokens_user_revoked_expires_idx" ON "auth_tokens" ("user_id", "revoked", "access_expires_at");

-- Index for cleanup queries (accessExpiresAt)
CREATE INDEX IF NOT EXISTS "auth_tokens_expiration_idx" ON "auth_tokens" ("access_expires_at");

-- Index for refresh token queries (refreshExpiresAt)
CREATE INDEX IF NOT EXISTS "auth_tokens_refresh_expiration_idx" ON "auth_tokens" ("refresh_expires_at");

-- Index for user platform queries (userId, platform)
CREATE INDEX IF NOT EXISTS "auth_tokens_user_platform_idx" ON "auth_tokens" ("user_id", "platform");
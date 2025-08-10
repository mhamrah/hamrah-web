-- Migration: Add auth_tokens table for universal authentication
-- Created: 2025-08-10
-- Purpose: Support both web sessions and mobile token-based authentication

-- Auth tokens table for mobile/API authentication
CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"access_expires_at" integer NOT NULL,
	"refresh_expires_at" integer NOT NULL,
	"platform" text NOT NULL, -- 'web', 'ios', 'android', 'api'
	"user_agent" text,
	"ip_address" text,
	"revoked" integer DEFAULT false NOT NULL,
	"last_used" integer,
	"created_at" integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- Index for efficient token lookups
CREATE INDEX IF NOT EXISTS "auth_tokens_token_hash_idx" ON "auth_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_refresh_token_hash_idx" ON "auth_tokens" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_user_id_idx" ON "auth_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "auth_tokens_expires_at_idx" ON "auth_tokens" ("access_expires_at");

-- Add platform tracking to users table for analytics
ALTER TABLE "users" ADD COLUMN "last_login_platform" text;
ALTER TABLE "users" ADD COLUMN "last_login_at" integer;
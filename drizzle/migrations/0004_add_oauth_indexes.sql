-- Migration: Add indexes for oauth_clients table
-- Created: 2025-08-17

-- Index for frequent active client lookups
CREATE INDEX IF NOT EXISTS "oauth_clients_active_idx" ON "oauth_clients" ("active");

-- Composite index for active client queries by type
CREATE INDEX IF NOT EXISTS "oauth_clients_active_type_idx" ON "oauth_clients" ("active", "application_type");

-- Index for client name searches
CREATE INDEX IF NOT EXISTS "oauth_clients_name_idx" ON "oauth_clients" ("client_name");
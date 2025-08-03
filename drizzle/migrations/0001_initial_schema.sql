-- Migration: Initial schema for fresh application
-- Created: 2025-08-03

-- Users table with support for OAuth providers and WebAuthn-only users
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"picture" text,
	"provider" text,
	"provider_id" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");

-- Sessions table for user authentication sessions
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" integer NOT NULL,
	"created_at" integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- WebAuthn credentials table
CREATE TABLE IF NOT EXISTS "webauthn_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" text,
	"aaguid" text,
	"credential_type" text DEFAULT 'public-key' NOT NULL,
	"user_verified" integer DEFAULT false NOT NULL,
	"credential_device_type" text,
	"credential_backed_up" integer DEFAULT false NOT NULL,
	"name" text,
	"last_used" integer,
	"created_at" integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- WebAuthn challenges table
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"expires_at" integer NOT NULL,
	"created_at" integer NOT NULL
);
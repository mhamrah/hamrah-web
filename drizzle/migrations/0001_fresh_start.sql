-- Fresh database schema for Hamrah App
-- Generated on: 2025-08-19
-- OIDC removed, native auth only

-- Users table with native authentication support
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`picture` text,
	`email_verified` integer,
	`auth_method` text,
	`provider` text,
	`provider_id` text,
	`last_login_platform` text,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

-- Unique index on email
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

-- Sessions table for web authentication
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

-- WebAuthn credentials table for passkey authentication
CREATE TABLE `webauthn_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`aaguid` text,
	`credential_type` text DEFAULT 'public-key' NOT NULL,
	`user_verified` integer DEFAULT false NOT NULL,
	`credential_device_type` text,
	`credential_backed_up` integer DEFAULT false NOT NULL,
	`name` text,
	`last_used` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

-- WebAuthn challenges table for temporary challenge storage
CREATE TABLE `webauthn_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);

-- Auth tokens table for mobile and API authentication
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`refresh_expires_at` integer NOT NULL,
	`platform` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`revoked` integer DEFAULT false NOT NULL,
	`last_used` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Indexes for auth_tokens table
CREATE INDEX `auth_tokens_user_revoked_expires_idx` ON `auth_tokens` (`user_id`,`revoked`,`access_expires_at`);
CREATE INDEX `auth_tokens_expiration_idx` ON `auth_tokens` (`access_expires_at`);
CREATE INDEX `auth_tokens_refresh_expiration_idx` ON `auth_tokens` (`refresh_expires_at`);
CREATE INDEX `auth_tokens_user_platform_idx` ON `auth_tokens` (`user_id`,`platform`);
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  emailVerified: integer("email_verified", { mode: "timestamp" }), // timestamp when email was verified
  authMethod: text("auth_method"), // 'google', 'apple', 'webauthn', etc.
  provider: text("provider"), // 'google', 'apple', or null for passkey-only users
  providerId: text("provider_id"), // Can be null for passkey-only users
  lastLoginPlatform: text("last_login_platform"), // 'web', 'ios', 'android', 'api'
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// WebAuthn credentials table
export const webauthnCredentials = sqliteTable("webauthn_credentials", {
  id: text("id").primaryKey(), // credential ID (base64url encoded)
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // stored as base64url
  counter: integer("counter").notNull().default(0),
  transports: text("transports"), // JSON array of transport methods
  aaguid: text("aaguid"), // Authenticator AAGUID
  credentialType: text("credential_type").notNull().default("public-key"),
  userVerified: integer("user_verified", { mode: "boolean" }).notNull().default(false),
  credentialDeviceType: text("credential_device_type"), // 'singleDevice' | 'multiDevice'
  credentialBackedUp: integer("credential_backed_up", { mode: "boolean" }).notNull().default(false),
  name: text("name"), // User-friendly name for the credential
  lastUsed: integer("last_used", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Challenge storage for WebAuthn flows
export const webauthnChallenges = sqliteTable("webauthn_challenges", {
  id: text("id").primaryKey(),
  challenge: text("challenge").notNull(),
  userId: text("user_id"), // null for registration challenges before user exists
  type: text("type").notNull(), // 'registration' | 'authentication'
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Auth tokens table for mobile/API authentication
export const authTokens = sqliteTable("auth_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  accessExpiresAt: integer("access_expires_at", { mode: "timestamp" }).notNull(),
  refreshExpiresAt: integer("refresh_expires_at", { mode: "timestamp" }).notNull(),
  platform: text("platform").notNull(), // 'web', 'ios', 'android', 'api'
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
  lastUsed: integer("last_used", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  // Composite index for token lookup queries
  userTokensIdx: index('auth_tokens_user_revoked_expires_idx').on(table.userId, table.revoked, table.accessExpiresAt),
  // Index for cleanup queries
  expirationIdx: index('auth_tokens_expiration_idx').on(table.accessExpiresAt),
  // Index for refresh token queries
  refreshExpirationIdx: index('auth_tokens_refresh_expiration_idx').on(table.refreshExpiresAt),
  // Index for user platform queries
  userPlatformIdx: index('auth_tokens_user_platform_idx').on(table.userId, table.platform),
}));


export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
export type WebAuthnCredential = typeof webauthnCredentials.$inferSelect;
export type NewWebAuthnCredential = typeof webauthnCredentials.$inferInsert;
export type WebAuthnChallenge = typeof webauthnChallenges.$inferSelect;
export type NewWebAuthnChallenge = typeof webauthnChallenges.$inferInsert;

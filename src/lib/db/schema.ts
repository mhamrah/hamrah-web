import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  picture: text("picture"),
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
});

// OAuth clients table for OIDC provider
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret'), // Null for public clients
  clientName: text('client_name').notNull(),
  applicationType: text('application_type').notNull(), // 'native' | 'web'
  redirectUris: text('redirect_uris').notNull(), // JSON array
  grantTypes: text('grant_types').notNull(), // JSON array
  responseTypes: text('response_types').notNull(), // JSON array
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull(),
  scopes: text('scopes').notNull(), // JSON array
  requireAuthTime: integer('require_auth_time', { mode: 'boolean' }).default(false),
  defaultMaxAge: integer('default_max_age'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

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
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;
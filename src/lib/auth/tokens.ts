import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import { eq, and, gt } from "drizzle-orm";
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { getDB, authTokens, users, type User, type AuthToken, type NewAuthToken } from "../db";

// Token configuration
export const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 1000 * 60 * 60, // 1 hour
  REFRESH_TOKEN_LIFETIME: 1000 * 60 * 60 * 24 * 30, // 30 days
  TOKEN_BYTE_LENGTH: 32, // 256 bits for strong security
} as const;

export type Platform = "web" | "ios" | "android" | "api";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  tokenId: string;
}

export interface TokenValidationResult {
  token: AuthToken | null;
  user: User | null;
  isValid: boolean;
  needsRefresh?: boolean;
}

/**
 * Generate a cryptographically secure token
 */
export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_CONFIG.TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

/**
 * Hash token for secure database storage
 */
export function hashToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/**
 * Generate unique token ID
 */
export function generateTokenId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return encodeHexLowerCase(bytes);
}

/**
 * Create a new token pair for a user
 */
export async function createTokenPair(
  event: RequestEventCommon,
  userId: string,
  platform: Platform,
  userAgent?: string
): Promise<TokenPair> {
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const tokenId = generateTokenId();
  
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME);
  const refreshExpiresAt = new Date(now.getTime() + TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME);
  
  const tokenData: NewAuthToken = {
    id: tokenId,
    userId,
    tokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    accessExpiresAt,
    refreshExpiresAt,
    platform,
    userAgent: userAgent || null,
    ipAddress: getClientIP(event),
    revoked: false,
    lastUsed: now,
    createdAt: now,
  };
  
  const db = getDB(event);
  await db.insert(authTokens).values(tokenData);
  
  return {
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    tokenId,
  };
}

/**
 * Validate an access token
 */
export async function validateAccessToken(
  event: RequestEventCommon,
  token: string
): Promise<TokenValidationResult> {
  const tokenHash = hashToken(token);
  const db = getDB(event);
  
  const result = await db
    .select({
      token: authTokens,
      user: users,
    })
    .from(authTokens)
    .innerJoin(users, eq(authTokens.userId, users.id))
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.revoked, false),
        gt(authTokens.accessExpiresAt, new Date())
      )
    );
    
  if (result.length === 0) {
    return { token: null, user: null, isValid: false };
  }
  
  const { token: authToken, user } = result[0];
  
  // Update last used timestamp
  await db
    .update(authTokens)
    .set({ lastUsed: new Date() })
    .where(eq(authTokens.id, authToken.id));
    
  // Check if token needs refresh (expires in less than 15 minutes)
  const needsRefresh = authToken.accessExpiresAt.getTime() - Date.now() < 1000 * 60 * 15;
  
  return {
    token: { ...authToken, lastUsed: new Date() },
    user,
    isValid: true,
    needsRefresh,
  };
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  event: RequestEventCommon,
  refreshToken: string
): Promise<TokenPair | null> {
  const refreshTokenHash = hashToken(refreshToken);
  const db = getDB(event);
  
  const result = await db
    .select({
      token: authTokens,
      user: users,
    })
    .from(authTokens)
    .innerJoin(users, eq(authTokens.userId, users.id))
    .where(
      and(
        eq(authTokens.refreshTokenHash, refreshTokenHash),
        eq(authTokens.revoked, false),
        gt(authTokens.refreshExpiresAt, new Date())
      )
    );
    
  if (result.length === 0) {
    return null;
  }
  
  const { token: existingToken, user } = result[0];
  
  // Generate new tokens
  const newAccessToken = generateToken();
  const newRefreshToken = generateToken();
  
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME);
  const refreshExpiresAt = new Date(now.getTime() + TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME);
  
  // Update the existing token record
  await db
    .update(authTokens)
    .set({
      tokenHash: hashToken(newAccessToken),
      refreshTokenHash: hashToken(newRefreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      lastUsed: now,
    })
    .where(eq(authTokens.id, existingToken.id));
    
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    tokenId: existingToken.id,
  };
}

/**
 * Revoke a token (logout)
 */
export async function revokeToken(
  event: RequestEventCommon,
  token: string
): Promise<boolean> {
  const tokenHash = hashToken(token);
  const db = getDB(event);
  
  const result = await db
    .update(authTokens)
    .set({ 
      revoked: true,
      lastUsed: new Date(),
    })
    .where(eq(authTokens.tokenHash, tokenHash));
    
  return result.success;
}

/**
 * Revoke all tokens for a user (logout from all devices)
 */
export async function revokeAllUserTokens(
  event: RequestEventCommon,
  userId: string
): Promise<number> {
  const db = getDB(event);
  
  const result = await db
    .update(authTokens)
    .set({ 
      revoked: true,
      lastUsed: new Date(),
    })
    .where(eq(authTokens.userId, userId));
    
  return result.meta.changes;
}

/**
 * Clean up expired tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(
  event: RequestEventCommon
): Promise<number> {
  const db = getDB(event);
  
  const result = await db
    .delete(authTokens)
    .where(
      and(
        eq(authTokens.revoked, true)
      )
    );
    
  return result.meta.changes;
}

/**
 * Get user's active tokens
 */
export async function getUserActiveTokens(
  event: RequestEventCommon,
  userId: string
): Promise<AuthToken[]> {
  const db = getDB(event);
  
  return await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.revoked, false),
        gt(authTokens.refreshExpiresAt, new Date())
      )
    );
}

/**
 * Extract client IP address from request
 */
function getClientIP(event: RequestEventCommon): string | null {
  // Check Cloudflare headers first
  const cfConnectingIP = event.request.headers.get('CF-Connecting-IP');
  if (cfConnectingIP) return cfConnectingIP;
  
  // Fallback to standard headers
  const xForwardedFor = event.request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  
  const xRealIP = event.request.headers.get('X-Real-IP');
  if (xRealIP) return xRealIP;
  
  return null;
}
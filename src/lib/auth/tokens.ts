// This file has been deprecated - token management is now handled via hamrah-api
// All token operations should use the API client or direct API calls instead
// See ~/lib/auth/api-client.ts for the replacement functionality

export type Platform = "web" | "ios" | "android" | "api";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  tokenId: string;
}

// Token configuration kept for reference
export const TOKEN_CONFIG = {
  ACCESS_TOKEN_LIFETIME: 1000 * 60 * 60, // 1 hour
  REFRESH_TOKEN_LIFETIME: 1000 * 60 * 60 * 24 * 30, // 30 days
  TOKEN_BYTE_LENGTH: 32, // 256 bits for strong security
} as const;

// Stub functions to maintain compatibility during migration
export function generateToken(): string {
  throw new Error("generateToken has been moved to hamrah-api");
}

export function validateAccessToken(event: any, token: string): any {
  throw new Error("validateAccessToken has been moved to hamrah-api");
}

export function createTokenPair(event: any, userId: string, platform: Platform, userAgent?: string): any {
  throw new Error("createTokenPair has been moved to hamrah-api");
}

export function refreshAccessToken(event: any, token: string): any {
  throw new Error("refreshAccessToken has been moved to hamrah-api");
}

export function revokeToken(event: any, tokenId: string): any {
  throw new Error("revokeToken has been moved to hamrah-api");
}

export function revokeAllUserTokens(event: any, userId: string): any {
  throw new Error("revokeAllUserTokens has been moved to hamrah-api");
}

export interface TokenValidationResult {
  token: any;
  user: any;
  isValid: boolean;
  needsRefresh?: boolean;
}
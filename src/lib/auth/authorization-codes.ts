import type { RequestEventCommon } from '@builder.io/qwik-city';
import { generateToken } from './tokens';
// Constants moved here from removed constants file
const AUTHORIZATION_CODE_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes
const PKCE_CODE_CHALLENGE_METHOD = 'S256';

export interface AuthorizationCodeData {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
  createdAt: number;
}

// In-memory storage for authorization codes (in production, use database or cache)
const authorizationCodes = new Map<string, AuthorizationCodeData>();

/**
 * Generate and store authorization code
 */
export function createAuthorizationCode(data: Omit<AuthorizationCodeData, 'code' | 'expiresAt' | 'createdAt'>): string {
  const code = generateToken();
  const now = Date.now();
  
  const codeData: AuthorizationCodeData = {
    ...data,
    code,
    expiresAt: now + AUTHORIZATION_CODE_LIFETIME_MS,
    createdAt: now,
  };
  
  authorizationCodes.set(code, codeData);
  
  // Clean up expired codes periodically
  cleanupExpiredCodes();
  
  return code;
}

/**
 * Validate and consume authorization code
 */
export function validateAndConsumeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier?: string
): AuthorizationCodeData | null {
  const codeData = authorizationCodes.get(code);
  
  if (!codeData) {
    return null;
  }
  
  // Check if code has expired
  if (Date.now() > codeData.expiresAt) {
    authorizationCodes.delete(code);
    return null;
  }
  
  // Validate client ID
  if (codeData.clientId !== clientId) {
    return null;
  }
  
  // Validate redirect URI
  if (codeData.redirectUri !== redirectUri) {
    return null;
  }
  
  // Validate PKCE if present
  if (codeData.codeChallenge && codeData.codeChallengeMethod) {
    if (!codeVerifier) {
      return null;
    }
    
    if (!validatePKCE(codeData.codeChallenge, codeData.codeChallengeMethod, codeVerifier)) {
      return null;
    }
  }
  
  // Consume the code (delete it so it can't be used again)
  authorizationCodes.delete(code);
  
  return codeData;
}

/**
 * Validate PKCE code challenge
 */
async function validatePKCE(
  codeChallenge: string,
  codeChallengeMethod: string,
  codeVerifier: string
): Promise<boolean> {
  if (codeChallengeMethod !== PKCE_CODE_CHALLENGE_METHOD) {
    return false;
  }
  
  try {
    // Create SHA256 hash of code verifier
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convert to base64url
    const hashArray = new Uint8Array(hashBuffer);
    const base64String = btoa(String.fromCharCode(...hashArray));
    const base64Url = base64String
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return base64Url === codeChallenge;
  } catch (error) {
    console.error('PKCE validation error:', error);
    return false;
  }
}

/**
 * Clean up expired authorization codes
 */
function cleanupExpiredCodes(): void {
  const now = Date.now();
  
  for (const [code, data] of authorizationCodes.entries()) {
    if (now > data.expiresAt) {
      authorizationCodes.delete(code);
    }
  }
}

/**
 * Get current authorization codes count (for monitoring)
 */
export function getAuthorizationCodesCount(): number {
  cleanupExpiredCodes();
  return authorizationCodes.size;
}
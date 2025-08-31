import type { RequestEventCommon } from '@builder.io/qwik-city';
import { validateAccessToken } from './tokens';
// import type { User } from '../db';
// TODO: Use API user type from hamrah-api client if available

export interface JWTAuthResult {
  isValid: boolean;
  user?: any; // Use API user type if available
  payload?: any;
  scopes?: string[];
  error?: string;
}

/**
 * Extract JWT token from Authorization header
 */
function extractTokenFromHeader(event: RequestEventCommon): string | null {
  const authHeader = event.request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Require JWT authentication with optional scopes
 */
export async function requireJWTAuth(
  event: RequestEventCommon,
  requiredScopes?: string[]
): Promise<JWTAuthResult> {
  try {
    const token = extractTokenFromHeader(event);

    if (!token) {
      return {
        isValid: false,
        error: 'Missing or invalid Authorization header'
      };
    }

    // Validate the access token
    const result = await validateAccessToken(event, token);

    if (!result.isValid || !result.user) {
      return {
        isValid: false,
        error: 'Invalid or expired token'
      };
    }

    // For now, we don't implement scope checking since our current token system
    // doesn't include scopes. This could be extended in the future.
    const scopes = ['openid', 'profile']; // Default scopes

    return {
      isValid: true,
      user: result.user,
      payload: {
        sub: result.user.id,
        client_id: 'default',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      scopes
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Token validation failed'
    };
  }
}

/**
 * Simple rate limiting (in-memory, not persistent)
 * In a real application, you'd want to use a more robust solution
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export async function checkJWTRateLimit(
  event: RequestEventCommon,
  clientId: string,
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): Promise<boolean> {
  const now = Date.now();
  const key = `jwt:${clientId}`;

  const current = rateLimitMap.get(key);

  if (!current || now > current.resetTime) {
    // Reset or initialize
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return true;
  }

  if (current.count >= maxRequests) {
    return false;
  }

  current.count++;
  return true;
}

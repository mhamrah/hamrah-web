import { jwtVerify, createRemoteJWKSet, type JWTPayload as JoseJWTPayload } from 'jose';
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { getDB, users } from '../db';
import { eq } from 'drizzle-orm';

export interface CustomJWTPayload extends JoseJWTPayload {
  client_id: string; // OAuth client ID
  scope: string; // Granted scopes
  email?: string;
  name?: string;
  picture?: string;
}

export interface TokenValidationResult {
  isValid: boolean;
  payload?: CustomJWTPayload;
  user?: any;
  error?: string;
  scopes?: string[];
}

/**
 * Create JWKS URI for token validation
 */
function getJWKSUri(issuer: string): string {
  return `${issuer}/.well-known/jwks.json`;
}

/**
 * Extract bearer token from request headers
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.slice(7); // Remove 'Bearer ' prefix
}

/**
 * Validate JWT access token issued by OIDC provider
 */
export async function validateJWTToken(
  event: RequestEventCommon,
  token: string
): Promise<TokenValidationResult> {
  try {
    // Get issuer URL
    const issuer = `${event.url.protocol}//${event.url.host}`;
    const jwksUri = `${issuer}/oidc/jwks`;
    
    // Create remote JWKS for token verification
    const JWKS = createRemoteJWKSet(new URL(jwksUri));
    
    // Verify the JWT token
    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience: ['hamrah-ios-app'], // Expected client IDs
      algorithms: ['RS256'],
    });

    const jwtPayload = payload as CustomJWTPayload;

    // Validate required claims
    if (!jwtPayload.sub || !jwtPayload.client_id) {
      return {
        isValid: false,
        error: 'Invalid token structure - missing required claims',
      };
    }

    // Validate client ID for mobile app
    if (jwtPayload.client_id !== 'hamrah-ios-app') {
      return {
        isValid: false,
        error: 'Invalid client ID',
      };
    }

    // Get user from database
    const db = getDB(event);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, jwtPayload.sub));

    if (!user) {
      return {
        isValid: false,
        error: 'User not found',
      };
    }

    // Parse scopes
    const scopes = jwtPayload.scope ? jwtPayload.scope.split(' ') : [];

    return {
      isValid: true,
      payload: jwtPayload,
      user,
      scopes,
    };

  } catch (error) {
    console.error('JWT validation error:', error);
    
    if (error instanceof Error) {
      // Handle specific JWT errors
      if (error.message.includes('expired')) {
        return {
          isValid: false,
          error: 'Token expired',
        };
      }
      
      if (error.message.includes('signature')) {
        return {
          isValid: false,
          error: 'Invalid token signature',
        };
      }
    }

    return {
      isValid: false,
      error: 'Token validation failed',
    };
  }
}

/**
 * Middleware for validating JWT tokens in API requests
 */
export async function requireJWTAuth(
  event: RequestEventCommon,
  requiredScopes: string[] = []
): Promise<TokenValidationResult> {
  // Extract token from request
  const token = extractBearerToken(event.request);
  
  if (!token) {
    return {
      isValid: false,
      error: 'Missing authorization token',
    };
  }

  // Validate the token
  const validation = await validateJWTToken(event, token);
  
  if (!validation.isValid) {
    return validation;
  }

  // Check required scopes
  if (requiredScopes.length > 0) {
    const hasRequiredScopes = requiredScopes.every(scope => 
      validation.scopes?.includes(scope)
    );
    
    if (!hasRequiredScopes) {
      return {
        isValid: false,
        error: `Insufficient scope. Required: ${requiredScopes.join(', ')}`,
      };
    }
  }

  return validation;
}

/**
 * Helper function to check if user has specific permission
 */
export function hasScope(scopes: string[] | undefined, requiredScope: string): boolean {
  return scopes?.includes(requiredScope) || false;
}

/**
 * Rate limiting for JWT endpoints
 */
export async function checkJWTRateLimit(
  event: RequestEventCommon,
  identifier: string
): Promise<boolean> {
  // Use Cloudflare KV for rate limiting (if available)
  if (!event.platform?.env?.KV) {
    // Fallback to in-memory rate limiting (not recommended for production)
    return true;
  }

  const key = `jwt_rate_limit:${identifier}`;
  const window = 3600; // 1 hour
  const limit = 1000; // 1000 requests per hour

  try {
    const current = await event.platform.env.KV.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      return false;
    }

    await event.platform.env.KV.put(key, (count + 1).toString(), {
      expirationTtl: window,
    });

    return true;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return true; // Allow request if rate limiting fails
  }
}

/**
 * Create authorization response for API errors
 */
export function createAuthErrorResponse(error: string, status = 401): Response {
  return new Response(
    JSON.stringify({
      error: 'unauthorized',
      error_description: error,
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer',
      },
    }
  );
}
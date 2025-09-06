import type { RequestEventCommon } from "@builder.io/qwik-city";
import {
  validateAccessToken,
  type TokenValidationResult,
} from "~/lib/auth/tokens";
import {
  validateSessionToken,
  deleteSessionTokenCookie,
  type SessionValidationResult,
} from "~/lib/auth/session";
import type { ApiUser as User } from "../lib/auth/api-client";

/**
 * Authentication middleware for universal login system
 * Supports both token-based (mobile/API) and session-based (web) authentication
 */

export interface AuthenticationResult {
  user: User;
  method: "token" | "session";
  token?: TokenValidationResult["token"];
  session?: SessionValidationResult["session"];
  needsRefresh?: boolean;
}

export interface AuthMiddlewareOptions {
  required?: boolean; // Whether authentication is required (default: true)
  allowExpired?: boolean; // Allow expired tokens/sessions (default: false)
  refreshThreshold?: number; // Time in ms before expiration to suggest refresh (default: 15 min)
}

/**
 * Main authentication middleware function
 * Attempts token authentication first, then falls back to session authentication
 */
export async function authenticateRequest(
  event: RequestEventCommon,
  options: AuthMiddlewareOptions = {},
): Promise<AuthenticationResult | null> {
  const {
    required = true,
    allowExpired = false,
    refreshThreshold = 1000 * 60 * 15, // 15 minutes
  } = options;

  // Try token-based authentication first
  const tokenAuth = await tryTokenAuth(event, allowExpired);
  if (tokenAuth) {
    return {
      user: tokenAuth.user,
      method: "token",
      token: tokenAuth.token,
      needsRefresh:
        tokenAuth.needsRefresh ||
        shouldRefresh(tokenAuth.token.accessExpiresAt, refreshThreshold),
    };
  }

  // Fallback to session-based authentication
  const sessionAuth = await trySessionAuth(event, allowExpired);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (sessionAuth?.user && sessionAuth?.session) {
    return {
      user: sessionAuth.user,
      method: "session",
      session: sessionAuth.session,
      needsRefresh: shouldRefresh(
        sessionAuth.session.expiresAt,
        refreshThreshold,
      ),
    };
  }

  // No valid authentication found
  if (required) {
    return handleUnauthorized(event);
  }

  return null;
}

/**
 * Middleware wrapper for route handlers
 */
export function requireAuth(options: AuthMiddlewareOptions = {}) {
  return async (event: RequestEventCommon) => {
    const authResult = await authenticateRequest(event, {
      ...options,
      required: true,
    });

    // Add auth info to event for use in handlers
    (event as any).auth = authResult;

    return authResult;
  };
}

/**
 * Middleware wrapper for optional authentication
 */
export function optionalAuth(options: AuthMiddlewareOptions = {}) {
  return async (event: RequestEventCommon) => {
    const authResult = await authenticateRequest(event, {
      ...options,
      required: false,
    });

    // Add auth info to event for use in handlers
    (event as any).auth = authResult;

    return authResult;
  };
}

/**
 * Convenience function to get user from authenticated request
 */
export function getAuthenticatedUser(event: RequestEventCommon): User {
  const auth = (event as any).auth as AuthenticationResult | undefined;
  if (!auth) {
    throw handleUnauthorized(event);
  }
  // TypeScript doesn't know auth is non-null after the check

  return auth.user;
}

/**
 * Check if user has specific permission or role
 */
export function requirePermission(event: RequestEventCommon): User {
  const user = getAuthenticatedUser(event);

  // Add your permission logic here based on your user model
  // For now, just return the user (all authenticated users have all permissions)

  return user;
}

/**
 * Attempt token-based authentication
 */
async function tryTokenAuth(
  event: RequestEventCommon,
  allowExpired: boolean = false,
): Promise<{
  user: User;
  token: NonNullable<TokenValidationResult["token"]>;
  needsRefresh?: boolean;
} | null> {
  const token = extractBearerToken(event);
  if (!token) return null;

  try {
    const result = await validateAccessToken(event, token);

    if (result.isValid && result.user && result.token) {
      return {
        user: result.user,
        token: result.token,
        needsRefresh: result.needsRefresh,
      };
    }

    // Handle expired tokens if allowed
    if (allowExpired && result.token) {
      // You might want to check if the token is only recently expired
      const isRecentlyExpired =
        result.token.accessExpiresAt.getTime() > Date.now() - 1000 * 60 * 5; // 5 min grace
      if (isRecentlyExpired) {
        // Re-validate to get user info from expired token
        // This would require a separate method that doesn't check expiration
        // For now, just return null
      }
    }
  } catch (error) {
    console.error("Token authentication error:", error);
  }

  return null;
}

/**
 * Attempt session-based authentication
 */
async function trySessionAuth(
  event: RequestEventCommon,
  allowExpired: boolean = false,
): Promise<SessionValidationResult | null> {
  const sessionToken = extractSessionToken(event);
  if (!sessionToken) return null;

  try {
    const result = await validateSessionToken(event, sessionToken);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (result?.success && result?.user) {
      return {
        success: true,
        isValid: true,
        session: result.session,
        user: result.user,
      };
    }

    // If session validation failed, clear the invalid cookie
    // This prevents repeated 500 errors for users with bad cookies
    if (!result.success) {
      deleteSessionTokenCookie(event);
    }

    // Handle expired sessions if allowed
    if (allowExpired) {
      // Session validation already handles expired sessions by deleting them
      // So we can't recover expired sessions easily
    }
  } catch (error) {
    console.error("Session authentication error:", error);
    // Clear the problematic cookie on any session validation error
    deleteSessionTokenCookie(event);
  }

  return { success: false, session: null, user: null, isValid: false };
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(event: RequestEventCommon): string | null {
  const authHeader = event.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7).trim();
  return token || null;
}

/**
 * Extract session token from cookie
 */
function extractSessionToken(event: RequestEventCommon): string | null {
  const sessionCookie = event.cookie.get("session")?.value;
  return sessionCookie || null;
}

/**
 * Check if token/session should be refreshed based on expiration time
 */
function shouldRefresh(
  expiresAt: Date | undefined,
  threshold: number,
): boolean {
  if (!expiresAt) return false;

  const timeUntilExpiry = expiresAt.getTime() - Date.now();
  return timeUntilExpiry < threshold && timeUntilExpiry > 0;
}

/**
 * Type guard to check if request is authenticated
 */
export function isAuthenticated(event: RequestEventCommon): boolean {
  const auth = (event as any).auth as AuthenticationResult;
  return !!auth;
}

/**
 * Get authentication method used for current request
 */
export function getAuthMethod(
  event: RequestEventCommon,
): "token" | "session" | null {
  const auth = (event as any).auth as AuthenticationResult | undefined;
  return auth ? auth.method : null;
}

/**
 * Check if authentication needs refresh
 */
export function needsRefresh(event: RequestEventCommon): boolean {
  const auth = (event as any).auth as AuthenticationResult | undefined;
  return auth ? auth.needsRefresh || false : false;
}

/**
 * Handle unauthorized access with proper cookie clearing and redirects
 * Distinguishes between API calls (returns 401 JSON) and web requests (redirects to login)
 */
function handleUnauthorized(event: RequestEventCommon): never {
  // Clear invalid session cookie if it exists
  const sessionCookie = event.cookie.get("session")?.value;
  if (sessionCookie) {
    deleteSessionTokenCookie(event);
  }

  // Check if this is an API request vs. a web page request
  const isApiRequest = isApiCall(event);

  if (isApiRequest) {
    // For API calls, return proper JSON 401 response
    throw event.json(401, {
      error: "Authentication required",
      message: "Your session has expired. Please log in again.",
    });
  } else {
    // For web requests, redirect to login page
    throw event.redirect(302, "/auth/login?error=session_expired");
  }
}

/**
 * Determine if the request is an API call vs. a web page request
 */
function isApiCall(event: RequestEventCommon): boolean {
  const url = new URL(event.request.url);

  // Check if the path starts with /api/
  if (url.pathname.startsWith("/api/")) {
    return true;
  }

  // Check Accept header - API calls typically request JSON
  const acceptHeader = event.request.headers.get("Accept");
  if (
    acceptHeader &&
    acceptHeader.includes("application/json") &&
    !acceptHeader.includes("text/html")
  ) {
    return true;
  }

  // Check Content-Type header - API calls often send JSON
  const contentType = event.request.headers.get("Content-Type");
  if (contentType && contentType.includes("application/json")) {
    return true;
  }

  // Check for Authorization header - indicates API usage
  if (event.request.headers.has("Authorization")) {
    return true;
  }

  // Default to web request
  return false;
}

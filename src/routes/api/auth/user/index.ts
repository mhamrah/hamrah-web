import type { RequestHandler } from "@builder.io/qwik-city";
import { validateAccessToken } from "~/lib/auth/tokens";
import { validateSessionToken } from "~/lib/auth/session";

/**
 * Current User Endpoint
 * GET /api/auth/user
 * 
 * Get current user information using either:
 * - Authorization: Bearer <access_token>
 * - Session cookie
 * - session_token query parameter
 */

interface UserResponse {
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string | null;
    provider?: string | null;
    last_login_platform?: string | null;
    last_login_at?: string | null;
    created_at: string;
    updated_at: string;
  };
  authentication_method: "token" | "session";
  expires_at?: string;
}

export const onGet: RequestHandler = async (event) => {
  let user = null;
  let authMethod: "token" | "session" | null = null;
  let expiresAt: Date | null = null;
  
  // Try token-based authentication first
  const authHeader = event.request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    
    try {
      const tokenResult = await validateAccessToken(event, token);
      if (tokenResult.isValid && tokenResult.user) {
        user = tokenResult.user;
        authMethod = "token";
        expiresAt = tokenResult.token?.accessExpiresAt || null;
      }
    } catch (error) {
      console.error("Token validation error:", error);
    }
  }
  
  // Fallback to session-based authentication
  if (!user) {
    // Check for session token in query params (for testing/debugging)
    const sessionTokenParam = event.url.searchParams.get("session_token");
    const sessionToken = sessionTokenParam || event.cookie.get("session")?.value;
    
    if (sessionToken) {
      try {
        const sessionResult = await validateSessionToken(event, sessionToken);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (sessionResult?.session && sessionResult?.user) {
          user = sessionResult.user;
          authMethod = "session";
          expiresAt = sessionResult.session.expiresAt;
        }
      } catch (error) {
        console.error("Session validation error:", error);
      }
    }
  }
  
  if (!user) {
    event.json(401, { error: "Authentication required" });
    return;
  }
  
  const response: UserResponse = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
      last_login_platform: user.lastLoginPlatform,
      last_login_at: user.lastLoginAt?.toISOString() || null,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    },
    authentication_method: authMethod!,
  };
  
  if (expiresAt) {
    response.expires_at = expiresAt.toISOString();
  }
  
  event.json(200, response);
};
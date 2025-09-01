import type { RequestHandler } from "@builder.io/qwik-city";
import { revokeToken, revokeAllUserTokens } from "~/lib/auth/tokens";
import {
  validateSessionToken,
  deleteSessionTokenCookie,
} from "~/lib/auth/session";

/**
 * Universal Logout Endpoint
 * POST /api/auth/logout
 *
 * Supports both session-based and token-based logout
 *
 * Body (optional): {
 *   access_token?: string,  // For token-based logout
 *   session_token?: string, // For session-based logout
 *   logout_all?: boolean    // Logout from all devices
 * }
 *
 * Can also logout using Authorization header: Bearer <token>
 * Or using session cookie
 */

interface LogoutRequest {
  access_token?: string;
  session_token?: string;
  logout_all?: boolean;
}

interface LogoutResponse {
  success: boolean;
  message: string;
  tokens_revoked?: number;
}

export const onPost: RequestHandler = async (event) => {
  let body: LogoutRequest = {};

  try {
    const rawBody = await event.request.text();
    if (rawBody) {
      body = JSON.parse(rawBody);
    }
  } catch {
    // Non-critical error, continue with empty body
  }

  const { access_token, session_token, logout_all = false } = body;

  // Try to get token from different sources
  let tokenToRevoke: string | null = null;
  let sessionToInvalidate: string | null = null;
  let userId: string | null = null;

  // 1. Check Authorization header
  const authHeader = event.request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    tokenToRevoke = authHeader.substring(7);
  }

  // 2. Check body parameters
  if (!tokenToRevoke && access_token) {
    tokenToRevoke = access_token;
  }

  if (session_token) {
    sessionToInvalidate = session_token;
  }

  // 3. Check session cookie
  const sessionCookie = event.cookie.get("session")?.value;
  if (!sessionToInvalidate && sessionCookie) {
    sessionToInvalidate = sessionCookie;
  }

  try {
    let tokensRevoked = 0;

    // Handle token-based logout
    if (tokenToRevoke) {
      const tokenResult = await import("~/lib/auth/tokens").then((m) =>
        m.validateAccessToken(event, tokenToRevoke),
      );

      if (tokenResult.isValid && tokenResult.user) {
        userId = tokenResult.user.id;

        if (logout_all) {
          // Revoke all tokens for this user
          tokensRevoked = await revokeAllUserTokens(event, userId || "");
        } else {
          // Revoke just this token
          const revoked = await revokeToken(event, tokenToRevoke);
          tokensRevoked = revoked ? 1 : 0;
        }
      }
    }

    // Handle session-based logout
    if (sessionToInvalidate) {
      const sessionResult = await validateSessionToken(
        event,
        sessionToInvalidate,
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (sessionResult?.isValid && sessionResult?.user) {
        if (!userId) {
          userId = sessionResult.user.id;
        }

        // Use public logout endpoint to invalidate session via cookie
        const { createApiClient } = await import("~/lib/auth/api-client");
        const apiClient = createApiClient(event);
        await apiClient.logout();

        // Clear session cookie
        deleteSessionTokenCookie(event);

        if (logout_all && userId) {
          // Also revoke all tokens for this user
          const additionalTokens = await revokeAllUserTokens(event, userId);
          tokensRevoked += additionalTokens;
        }
      }
    }

    // If logout_all was requested but we couldn't identify a user
    if (logout_all && !userId) {
      event.json(400, {
        error: "Cannot logout from all devices without valid authentication",
      });
    }

    const response: LogoutResponse = {
      success: true,
      message: logout_all
        ? "Logged out from all devices"
        : "Logged out successfully",
    };

    if (tokensRevoked > 0) {
      response.tokens_revoked = tokensRevoked;
    }

    event.json(200, response);
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw HTTP errors
    }

    console.error("Logout error:", error);
    event.json(500, { error: "Logout failed" });
  }
};

// GET endpoint for simple logout (web compatibility)
export const onGet: RequestHandler = async (event) => {
  const sessionCookie = event.cookie.get("session")?.value;

  if (sessionCookie) {
    try {
      const sessionResult = await validateSessionToken(event, sessionCookie);

      if (sessionResult.isValid) {
        // Use public logout endpoint to invalidate session via cookie
        const { createApiClient } = await import("~/lib/auth/api-client");
        const apiClient = createApiClient(event);
        await apiClient.logout();
      }

      deleteSessionTokenCookie(event);
    } catch (error) {
      console.error("Session logout error:", error);
    }
  }

  // Redirect to login page
  throw event.redirect(302, "/auth/login");
};

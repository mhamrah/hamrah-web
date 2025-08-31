import type { RequestHandler } from "@builder.io/qwik-city";
import {
  requireJWTAuth,
  checkJWTRateLimit,
} from "../../../../../lib/auth/jwt-validator";
// Note: This endpoint should be refactored to use hamrah-api instead of direct DB access

/**
 * Protected API endpoint - Get user profile
 * Requires valid JWT token from OIDC provider
 */
export const onGet: RequestHandler = async (event) => {
  try {
    // Rate limiting
    const clientId = event.request.headers.get("cf-connecting-ip") || "unknown";
    const rateLimitOk = await checkJWTRateLimit(event, clientId);

    if (!rateLimitOk) {
      event.json(429, {
        error: "rate_limit_exceeded",
        error_description: "Rate limit exceeded",
      });
      return;
    }

    // Validate JWT token and require 'profile' scope
    const authResult = await requireJWTAuth(event, ["openid", "profile"]);

    if (!authResult.isValid) {
      event.json(401, {
        error: "unauthorized",
        error_description: authResult.error || "Authentication failed",
      });
      return;
    }

    const { user, payload } = authResult;

    if (!user) {
      event.json(401, {
        error: "unauthorized",
        error_description: "User not found",
      });
      return;
    }

    // Return user profile data
    const profileData: any = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
      lastLoginAt: user.lastLoginAt,
      lastLoginPlatform: user.lastLoginPlatform,
    };

    // Include token info for debugging only in development
    if (process.env.NODE_ENV !== "production") {
      profileData.tokenInfo = {
        clientId: payload?.client_id,
        scopes: authResult.scopes,
        issuedAt: payload?.iat,
        expiresAt: payload?.exp,
      };
    }

    event.json(200, profileData);
  } catch (error) {
    console.error("Profile API error:", error);

    event.json(500, {
      error: "internal_error",
      error_description: "An internal server error occurred",
    });
  }
};

/**
 * Update user profile
 */
export const onPatch: RequestHandler = async (event) => {
  try {
    // Rate limiting
    const clientId = event.request.headers.get("cf-connecting-ip") || "unknown";
    const rateLimitOk = await checkJWTRateLimit(event, clientId);

    if (!rateLimitOk) {
      event.json(429, {
        error: "rate_limit_exceeded",
        error_description: "Rate limit exceeded",
      });
      return;
    }

    // Validate JWT token and require 'profile' scope
    const authResult = await requireJWTAuth(event, ["openid", "profile"]);

    if (!authResult.isValid || !authResult.user) {
      event.json(401, {
        error: "unauthorized",
        error_description: authResult.error || "Authentication failed",
      });
      return;
    }

    // Parse request body
    const body = (await event.request.json()) as {
      name?: string;
      picture?: string;
    };
    const { name, picture } = body;

    // Validate input
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      event.json(400, {
        error: "invalid_request",
        error_description: "Name is required and must be a non-empty string",
      });
      return;
    }

    if (
      picture &&
      (typeof picture !== "string" || picture.trim().length === 0)
    ) {
      event.json(400, {
        error: "invalid_request",
        error_description: "Picture must be a valid URL string",
      });
      return;
    }

    // TODO: Update user via hamrah-api instead of direct database access
    // For now, return error indicating this functionality needs migration
    event.json(501, {
      error: "not_implemented",
      error_description: "Profile update functionality is being migrated to hamrah-api",
    });
  } catch (error) {
    console.error("Profile update error:", error);

    event.json(500, {
      error: "internal_error",
      error_description: "An internal server error occurred",
    });
  }
};

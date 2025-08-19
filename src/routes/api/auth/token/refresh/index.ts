import type { RequestHandler } from "@builder.io/qwik-city";
import { refreshAccessToken } from "~/lib/auth/tokens";

/**
 * Token Refresh Endpoint
 * POST /api/auth/token/refresh
 *
 * Refresh an expired access token using a valid refresh token
 *
 * Body: {
 *   refresh_token: string
 * }
 */

interface TokenRefreshRequest {
  refresh_token: string;
}

interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export const onPost: RequestHandler = async (event) => {
  let body: TokenRefreshRequest;

  try {
    body = await event.request.json();
  } catch {
    throw event.error(400, "Invalid JSON body");
  }

  const { refresh_token } = body;

  if (!refresh_token) {
    throw event.error(400, "Missing refresh_token");
  }

  try {
    const tokenPair = await refreshAccessToken(event, refresh_token);

    if (!tokenPair) {
      throw event.error(401, "Invalid or expired refresh token");
    }

    const response: TokenRefreshResponse = {
      access_token: tokenPair.accessToken,
      refresh_token: tokenPair.refreshToken,
      token_type: "Bearer",
      expires_in: Math.floor(
        (tokenPair.accessExpiresAt.getTime() - Date.now()) / 1000,
      ),
    };

    event.json(200, response);
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw HTTP errors
    }

    console.error("Token refresh error:", error);
    event.json(500, { error: "Token refresh failed" });
  }
};

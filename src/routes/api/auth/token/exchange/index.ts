import type { RequestHandler } from "@builder.io/qwik-city";
import { createTokenPair, type Platform } from "~/lib/auth/tokens";
import { validateSessionToken } from "~/lib/auth/session";
import { getDB, users } from "~/lib/db";
import { eq } from "drizzle-orm";

/**
 * Token Exchange Endpoint
 * POST /api/auth/token/exchange
 * 
 * Exchange a web session for mobile tokens
 * Useful for users who logged in on web and want to use the mobile app
 * 
 * Body: {
 *   session_token: string,
 *   platform: "ios" | "android" | "api"
 * }
 */

interface TokenExchangeRequest {
  session_token: string;
  platform: Platform;
}

interface TokenExchangeResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string | null;
  };
}

export const onPost: RequestHandler = async (event) => {
  let body: TokenExchangeRequest;
  
  try {
    body = await event.request.json();
  } catch {
    throw event.error(400, "Invalid JSON body");
  }
  
  const { session_token, platform } = body;
  
  if (!session_token) {
    throw event.error(400, "Missing session_token");
  }
  
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!platform) {
    throw event.error(400, "Missing platform");
  }
  
  if (!["ios", "android", "api"].includes(platform)) {
    throw event.error(400, "Invalid platform");
  }
  
  try {
    // Validate the session token
    const sessionResult = await validateSessionToken(event, session_token);
    
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!sessionResult?.session || !sessionResult?.user) {
      throw event.error(401, "Invalid or expired session");
    }
    
    // Update user login tracking
    const db = getDB(event);
    await db
      .update(users)
      .set({
        lastLoginPlatform: platform,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, sessionResult.user.id));
    
    // Create new token pair for the requested platform
    const userAgent = event.request.headers.get("User-Agent") || undefined;
    const tokenPair = await createTokenPair(
      event,
      sessionResult.user.id,
      platform,
      userAgent
    );
    
    const response: TokenExchangeResponse = {
      access_token: tokenPair.accessToken,
      refresh_token: tokenPair.refreshToken,
      token_type: "Bearer",
      expires_in: Math.floor((tokenPair.accessExpiresAt.getTime() - Date.now()) / 1000),
      user: {
        id: sessionResult.user.id,
        email: sessionResult.user.email,
        name: sessionResult.user.name,
        picture: sessionResult.user.picture,
      },
    };
    
    event.json(200, response);
    
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw HTTP errors
    }
    
    console.error("Token exchange error:", error);
    event.json(500, { error: "Token exchange failed" });
  }
};
import type { RequestHandler } from "@builder.io/qwik-city";
import { getGoogleProvider, getAppleProvider } from "~/lib/auth/providers";
import { findOrCreateUser } from "~/lib/auth/user-service";
import { createTokenPair, type Platform } from "~/lib/auth/tokens";
import { validateOAuthState, parseCallbackParams } from "~/lib/auth/pkce";
import { createSession, generateSessionToken, setSessionTokenCookie } from "~/lib/auth/session";
import { getDB, users } from "~/lib/db";
import { eq } from "drizzle-orm";

/**
 * Universal OAuth callback endpoint
 * Handles both web redirects and mobile API responses
 * 
 * For web: Redirects with session cookie
 * For mobile: Returns JSON with tokens
 */

interface TokenResponse {
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

// Handle GET requests (web flows and some mobile flows)
export const onGet: RequestHandler = async (event) => {
  const provider = event.params.provider as string;
  
  if (!["google", "apple"].includes(provider)) {
    return handleError(event, "unsupported_provider", "web");
  }
  
  // Parse callback parameters
  const callbackParams = parseCallbackParams(event.url.searchParams);
  
  if (!callbackParams) {
    return handleError(event, "invalid_request", "web");
  }
  
  if (callbackParams.error) {
    console.log(`OAuth error from ${provider}:`, callbackParams.error, callbackParams.errorDescription);
    return handleError(event, callbackParams.error, "web");
  }
  
  // Validate state parameter
  const storedState = event.cookie.get(`${provider}_oauth_state`)?.value;
  if (!storedState || !validateOAuthState(callbackParams.state, storedState)) {
    return handleError(event, "invalid_state", "web");
  }
  
  // Get stored code verifier
  const codeVerifier = event.cookie.get(`${provider}_oauth_code_verifier`)?.value;
  if (!codeVerifier) {
    return handleError(event, "missing_code_verifier", "web");
  }
  
  try {
    const userProfile = await exchangeCodeForProfile(event, provider, callbackParams.code, codeVerifier);
    
    // Find or create user
    const userId = await findOrCreateUser(event, userProfile);
    
    // Update user login tracking
    const db = getDB(event);
    await db
      .update(users)
      .set({
        lastLoginPlatform: "web",
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    // Create web session
    const sessionToken = generateSessionToken();
    const session = await createSession(event, sessionToken, userId);
    setSessionTokenCookie(event, sessionToken, session.expiresAt);
    
    // Clear OAuth cookies
    event.cookie.delete(`${provider}_oauth_state`);
    event.cookie.delete(`${provider}_oauth_code_verifier`);
    
    // Redirect to app
    throw event.redirect(302, "/");
    
  } catch (error) {
    console.error(`OAuth callback error for ${provider}:`, error);
    return handleError(event, "oauth_error", "web");
  }
};

// Handle POST requests (mobile flows with code exchange)
export const onPost: RequestHandler = async (event) => {
  const provider = event.params.provider as string;
  
  if (!["google", "apple"].includes(provider)) {
    throw event.error(400, "Unsupported OAuth provider");
  }
  
  let body: {
    code: string;
    code_verifier: string;
    state: string;
    platform: Platform;
    redirect_uri?: string;
  };
  
  try {
    body = await event.request.json();
  } catch {
    throw event.error(400, "Invalid JSON body");
  }
  
  const { code, code_verifier, state, platform } = body;
  
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!code || !code_verifier || !state || !platform) {
    throw event.error(400, "Missing required parameters");
  }
  
  if (!["web", "ios", "android", "api"].includes(platform)) {
    throw event.error(400, "Invalid platform");
  }
  
  try {
    const userProfile = await exchangeCodeForProfile(event, provider, code, code_verifier);
    
    // Find or create user
    const userId = await findOrCreateUser(event, userProfile);
    
    // Update user login tracking
    const db = getDB(event);
    await db
      .update(users)
      .set({
        lastLoginPlatform: platform,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, userId));
    
    // Create token pair for mobile/API access
    const userAgent = event.request.headers.get("User-Agent") || undefined;
    const tokenPair = await createTokenPair(event, userId, platform, userAgent);
    
    // Get user info for response
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
      
    if (user.length === 0) {
      throw new Error("User not found after creation");
    }
    
    const response: TokenResponse = {
      access_token: tokenPair.accessToken,
      refresh_token: tokenPair.refreshToken,
      token_type: "Bearer",
      expires_in: Math.floor((tokenPair.accessExpiresAt.getTime() - Date.now()) / 1000),
      user: {
        id: user[0].id,
        email: user[0].email,
        name: user[0].name,
        picture: user[0].picture,
      },
    };
    
    event.json(200, response);
    
  } catch (error) {
    console.error(`OAuth callback error for ${provider}:`, error);
    throw event.error(500, "OAuth callback failed");
  }
};

/**
 * Exchange authorization code for user profile
 */
async function exchangeCodeForProfile(
  event: any,
  provider: string,
  code: string,
  codeVerifier: string,
) {
  if (provider === "google") {
    const google = getGoogleProvider(event);
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    
    const idToken = tokens.idToken();
    if (!idToken) {
      throw new Error("No ID token received from Google");
    }
    
    const idTokenPayload = JSON.parse(atob(idToken.split(".")[1]));
    
    return {
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      picture: idTokenPayload.picture || null,
      provider: "google" as const,
      providerId: idTokenPayload.sub,
    };
    
  } else if (provider === "apple") {
    const apple = getAppleProvider(event);
    
    // For Apple OAuth validation
    const tokens = await apple.validateAuthorizationCode(code);
    
    const idToken = tokens.idToken();
    if (!idToken) {
      throw new Error("No ID token received from Apple");
    }
    
    const idTokenPayload = JSON.parse(atob(idToken.split(".")[1]));
    
    return {
      email: idTokenPayload.email,
      name: idTokenPayload.name || idTokenPayload.email.split("@")[0],
      picture: null, // Apple doesn't provide profile pictures
      provider: "apple" as const,
      providerId: idTokenPayload.sub,
    };
  }
  
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Handle errors for web flows (redirect) vs API flows (JSON)
 */
function handleError(event: any, error: string, flow: "web" | "api" = "web") {
  if (flow === "web") {
    throw event.redirect(302, `/auth/login?error=${error}`);
  } else {
    throw event.error(400, error);
  }
}
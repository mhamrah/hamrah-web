import type { RequestHandler } from "@builder.io/qwik-city";
import { getGoogleProvider, getAppleProvider } from "~/lib/auth/providers";
import { validateOAuthState, parseCallbackParams } from "~/lib/auth/pkce";
import { setSessionTokenCookie } from "~/lib/auth/session";
import { createApiClient } from "~/lib/auth/api-client";
import type { Platform } from "~/lib/auth/tokens";

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
    console.log(
      `OAuth error from ${provider}:`,
      callbackParams.error,
      callbackParams.error_description,
    );
    return handleError(event, callbackParams.error, "web");
  }

  // Validate state parameter
  const storedState = event.cookie.get(`${provider}_oauth_state`)?.value;
  if (
    !storedState ||
    !callbackParams.state ||
    !validateOAuthState(callbackParams.state, storedState)
  ) {
    return handleError(event, "invalid_state", "web");
  }

  // Get stored code verifier
  const codeVerifier = event.cookie.get(
    `${provider}_oauth_code_verifier`,
  )?.value;
  if (!codeVerifier) {
    return handleError(event, "missing_code_verifier", "web");
  }

  try {
    const userProfile = await exchangeCodeForProfile(
      event,
      provider,
      callbackParams.code!,
      codeVerifier,
    );

    // Create user and session via API
    const apiClient = createApiClient(event);

    // Create user via API
    const userResult = await apiClient.createUser({
      email: userProfile.email,
      name: userProfile.name,
      picture: userProfile.picture,
      auth_method: provider,
      provider: userProfile.provider,
      provider_id: userProfile.providerId,
      platform: "web",
      user_agent: event.request.headers.get("User-Agent") || undefined,
    });

    if (!userResult.success || !userResult.user) {
      throw new Error("Failed to create/update user");
    }

    // Create web session via API
    const sessionResult = await apiClient.createSession({
      user_id: userResult.user.id,
      platform: "web",
    });

    if (!sessionResult.success || !sessionResult.session) {
      throw new Error("Failed to create session");
    }

    // Set session cookie
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
    setSessionTokenCookie(event, sessionResult.session, expiresAt);

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
    const userProfile = await exchangeCodeForProfile(
      event,
      provider,
      code,
      code_verifier,
    );

    // Create user and tokens via API
    const apiClient = createApiClient(event);

    // First create user via API
    const userResult = await apiClient.createUser({
      email: userProfile.email,
      name: userProfile.name,
      picture: userProfile.picture,
      auth_method: provider,
      provider: userProfile.provider,
      provider_id: userProfile.providerId,
      platform: platform as "web" | "ios",
      user_agent: event.request.headers.get("User-Agent") || undefined,
    });

    if (!userResult.success || !userResult.user) {
      throw new Error("Failed to create/update user");
    }

    // Then create tokens for mobile/API access
    const tokenResult = await apiClient.createTokens({
      user_id: userResult.user.id,
      platform: platform as "web" | "ios",
    });

    if (
      !tokenResult.success ||
      !tokenResult.access_token
    ) {
      throw new Error("Failed to create tokens");
    }

    const response: TokenResponse = {
      access_token: tokenResult.access_token!,
      refresh_token: tokenResult.refresh_token || "",
      token_type: "Bearer",
      expires_in: tokenResult.expires_in || 3600,
      user: {
        id: userResult.user.id,
        email: userResult.user.email,
        name: userResult.user.name || "User",
        picture: userResult.user.picture,
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

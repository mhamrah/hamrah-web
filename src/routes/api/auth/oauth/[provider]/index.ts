import type { RequestHandler } from "@builder.io/qwik-city";
import { getGoogleProvider } from "~/lib/auth/providers";
import { generatePKCECodePair, generateOAuthState } from "~/lib/auth/pkce";

/**
 * Universal OAuth initiation endpoint
 * POST /api/auth/oauth/[provider]
 * 
 * Supports both web redirects and mobile custom URL schemes
 * Body: {
 *   platform: "web" | "ios" | "android" | "api",
 *   redirect_uri?: string, // Optional override for mobile deep links
 *   state?: string // Optional custom state for mobile flows
 * }
 */

interface OAuthInitiationRequest {
  platform: "web" | "ios" | "android" | "api";
  redirect_uri?: string;
  state?: string;
}

interface OAuthInitiationResponse {
  authorization_url: string;
  state: string;
  code_verifier?: string; // Only returned for mobile platforms
  expires_in: number; // State/PKCE expiration time in seconds
}

export const onPost: RequestHandler = async (event) => {
  const provider = event.params.provider as string;
  
  if (!["google", "apple"].includes(provider)) {
    throw event.error(400, "Unsupported OAuth provider");
  }
  
  let body: OAuthInitiationRequest;
  try {
    body = await event.request.json();
  } catch {
    throw event.error(400, "Invalid JSON body");
  }
  
  if (!body.platform) {
    throw event.error(400, "Missing platform");
  }
  
  if (!["web", "ios", "android", "api"].includes(body.platform)) {
    throw event.error(400, "Invalid platform");
  }
  
  const { platform, redirect_uri, state: customState } = body;
  
  try {
    // Generate PKCE and state parameters
    const pkce = generatePKCECodePair();
    const state = customState || generateOAuthState();
    
    // Determine redirect URI
    let redirectURI: string;
    if (redirect_uri) {
      // Mobile app provided custom redirect URI (deep link)
      redirectURI = redirect_uri;
    } else if (platform === "web") {
      // Web flow - use standard callback
      const baseURL = event.url.protocol + "//" + event.url.host;
      redirectURI = `${baseURL}/auth/${provider}/callback`;
    } else {
      // Mobile flow - use API callback by default
      const baseURL = event.url.protocol + "//" + event.url.host;
      redirectURI = `${baseURL}/api/auth/callback/${provider}`;
    }
    
    let authorizationURL: URL;
    
    if (provider === "google") {
      const google = getGoogleProvider(event);
      
      // Get Google's authorization URL
      const googleAuthURL = await google.createAuthorizationURL(state, pkce.codeVerifier, ["openid", "email", "profile"]);
      
      authorizationURL = googleAuthURL;
      
      // Override redirect_uri if custom one provided
      if (redirect_uri) {
        authorizationURL.searchParams.set("redirect_uri", redirect_uri);
      }
      
    } else if (provider === "apple") {
      // For Apple, we need to construct the URL manually with PKCE  
      const clientId = (event.platform.env as any).APPLE_CLIENT_ID as string;
      authorizationURL = new URL("https://appleid.apple.com/auth/authorize");
      authorizationURL.searchParams.set("response_type", "code");
      authorizationURL.searchParams.set("client_id", clientId);
      authorizationURL.searchParams.set("redirect_uri", redirectURI);
      authorizationURL.searchParams.set("scope", "openid email name");
      authorizationURL.searchParams.set("state", state);
      authorizationURL.searchParams.set("code_challenge", pkce.codeChallenge);
      authorizationURL.searchParams.set("code_challenge_method", "S256");
      authorizationURL.searchParams.set("response_mode", "form_post");
      
    } else {
      throw event.error(500, "Provider configuration error");
    }
    
    // Store OAuth state and PKCE verifier in cookies for web flows
    // Mobile flows will need to store these locally
    if (platform === "web") {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes
      
      event.cookie.set(`${provider}_oauth_state`, state, {
        httpOnly: true,
        sameSite: "lax",
        secure: event.url.protocol === "https:",
        expires: expiresAt,
        path: "/",
      });
      
      event.cookie.set(`${provider}_oauth_code_verifier`, pkce.codeVerifier, {
        httpOnly: true,
        sameSite: "lax",
        secure: event.url.protocol === "https:",
        expires: expiresAt,
        path: "/",
      });
    }
    
    const response: OAuthInitiationResponse = {
      authorization_url: authorizationURL.toString(),
      state,
      expires_in: 600, // 10 minutes
    };
    
    // Include code_verifier for mobile platforms (they need to store it)
    if (platform !== "web") {
      response.code_verifier = pkce.codeVerifier;
    }
    
    event.json(200, response);
    
  } catch (error) {
    console.error(`OAuth initiation error for ${provider}:`, error);
    throw event.error(500, "OAuth initiation failed");
  }
};

// GET endpoint for direct web redirects (backwards compatibility)
export const onGet: RequestHandler = async (event) => {
  const provider = event.params.provider as string;
  
  if (!["google", "apple"].includes(provider)) {
    throw event.redirect(302, "/auth/login?error=unsupported_provider");
  }
  
  try {
    // Generate PKCE and state for web flow
    const pkce = generatePKCECodePair();
    const state = generateOAuthState();
    
    const baseURL = event.url.protocol + "//" + event.url.host;
    const redirectURI = `${baseURL}/auth/${provider}/callback`;
    
    let authorizationURL: URL;
    
    if (provider === "google") {
      const google = getGoogleProvider(event);
      authorizationURL = await google.createAuthorizationURL(state, pkce.codeVerifier, ["openid", "email", "profile"]);
    } else if (provider === "apple") {
      const clientId = (event.platform.env as any).APPLE_CLIENT_ID as string;
      authorizationURL = new URL("https://appleid.apple.com/auth/authorize");
      authorizationURL.searchParams.set("response_type", "code");
      authorizationURL.searchParams.set("client_id", clientId);
      authorizationURL.searchParams.set("redirect_uri", redirectURI);
      authorizationURL.searchParams.set("scope", "openid email name");
      authorizationURL.searchParams.set("state", state);
      authorizationURL.searchParams.set("code_challenge", pkce.codeChallenge);
      authorizationURL.searchParams.set("code_challenge_method", "S256");
      authorizationURL.searchParams.set("response_mode", "form_post");
    } else {
      throw new Error("Unsupported provider");
    }
    
    // Store OAuth state and PKCE verifier in cookies
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes
    
    event.cookie.set(`${provider}_oauth_state`, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: event.url.protocol === "https:",
      expires: expiresAt,
      path: "/",
    });
    
    event.cookie.set(`${provider}_oauth_code_verifier`, pkce.codeVerifier, {
      httpOnly: true,
      sameSite: "lax",
      secure: event.url.protocol === "https:",
      expires: expiresAt,
      path: "/",
    });
    
    throw event.redirect(302, authorizationURL.toString());
    
  } catch (error) {
    console.error(`OAuth initiation error for ${provider}:`, error);
    throw event.redirect(302, "/auth/login?error=oauth_error");
  }
};
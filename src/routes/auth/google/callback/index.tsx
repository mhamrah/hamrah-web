import type { RequestHandler } from "@builder.io/qwik-city";
import { getGoogleProvider } from "~/lib/auth/providers";
import { setSessionTokenCookie } from "~/lib/auth/session";
import { createApiClient } from "~/lib/auth/api-client";

export const onGet: RequestHandler = async (event) => {
  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors first
  if (error) {
    let errorMessage = "OAuth authentication failed";
    if (error === "access_denied") {
      errorMessage = "Authentication was cancelled";
    } else if (errorDescription) {
      errorMessage = decodeURIComponent(errorDescription);
    }

    throw event.redirect(
      302,
      `/auth/login?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  // Production OAuth flow
  const storedState = event.cookie.get("google_oauth_state")?.value ?? null;
  const codeVerifier =
    event.cookie.get("google_oauth_code_verifier")?.value ?? null;

  if (
    !code ||
    !state ||
    !storedState ||
    !codeVerifier ||
    state !== storedState
  ) {
    console.log(
      "bad state",
      JSON.stringify(state),
      JSON.stringify(storedState),
    );
    throw event.redirect(302, "/auth/login?error=invalid_request");
  }

  const google = getGoogleProvider(event);
  const tokens = await google.validateAuthorizationCode(code, codeVerifier);

  // Extract user info from OpenID Connect ID token (more efficient than API call)
  const idToken = tokens.idToken();
  if (!idToken) {
    throw new Error("No ID token received from Google");
  }

  const idTokenPayload = JSON.parse(atob(idToken.split(".")[1]));

  // OpenID Connect standard claims + Google-specific claims
  const googleUser = {
    sub: idTokenPayload.sub, // Subject (unique user ID)
    email: idTokenPayload.email,
    email_verified: idTokenPayload.email_verified,
    name: idTokenPayload.name,
    given_name: idTokenPayload.given_name, // First name
    family_name: idTokenPayload.family_name, // Last name
    picture: idTokenPayload.picture,
    locale: idTokenPayload.locale, // Language preference
    hd: idTokenPayload.hd, // Hosted domain (for Google Workspace users)
  };

  // Additional claims available but not currently stored:
  // - aud: Audience (your client_id)
  // - iss: Issuer (https://accounts.google.com)
  // - iat: Issued at time
  // - exp: Expiration time
  // - at_hash: Access token hash

  try {
    // Create user and session via API
    const apiClient = createApiClient(event);
    const userResult = await apiClient.createUser({
      email: googleUser.email,
      name: googleUser.name,
      picture: undefined, // Don't store - will be fetched fresh from session
      auth_method: "google",
      provider: "google",
      provider_id: googleUser.sub, // Use 'sub' claim as the unique provider ID
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

    if (sessionResult.success && sessionResult.session) {
      // Note: Fresh profile data (picture, locale, etc.) is not stored in DB
      // to avoid staleness. For apps requiring up-to-date profile data,
      // consider storing ID token securely or re-fetching from provider.

      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
      setSessionTokenCookie(event, sessionResult.session, expiresAt);
    }
  } catch (error) {
    console.log("could not write to db", error);
    throw error;
  }

  // Clear OAuth cookies
  event.cookie.delete("google_oauth_state");
  event.cookie.delete("google_oauth_code_verifier");

  throw event.redirect(302, "/");
};

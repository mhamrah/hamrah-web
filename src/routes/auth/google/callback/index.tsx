import type { RequestHandler } from "@builder.io/qwik-city";
import { eq } from "drizzle-orm";
import { getGoogleProvider } from "~/lib/auth/providers";
import { getDB, users } from "~/lib/db";
import { generateUserId } from "~/lib/auth/utils";
import {
  generateSessionToken,
  createSession,
  setSessionTokenCookie,
} from "~/lib/auth/session";

export const onGet: RequestHandler = async (event) => {
  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
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
    const db = getDB(event);

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .limit(1);

    let userId: string;

    if (existingUser.length > 0) {
      // Update user profile data from Google ID token
      userId = existingUser[0].id;
      await db
        .update(users)
        .set({
          name: googleUser.name || googleUser.email.split("@")[0],
          email: googleUser.email,
          picture: googleUser.picture,
          providerId: googleUser.sub, // Update in case Google ID changed
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      // Create new user - only store essential data, profile data comes from ID token
      userId = generateUserId();
      await db.insert(users).values({
        id: userId,
        email: googleUser.email,
        name: googleUser.name || googleUser.email.split("@")[0], // Fallback display name
        picture: googleUser.picture,
        provider: "google",
        providerId: googleUser.sub, // Use 'sub' claim as the unique provider ID
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    // Create session
    const sessionToken = generateSessionToken();
    const session = await createSession(event, sessionToken, userId);

    // Note: Fresh profile data (picture, locale, etc.) is not stored in DB
    // to avoid staleness. For apps requiring up-to-date profile data,
    // consider storing ID token securely or re-fetching from provider.

    // Set session cookie
    setSessionTokenCookie(event, sessionToken, session.expiresAt);
  } catch (error) {
    console.log("could not write to db", error);
    throw error;
  }

  // Clear OAuth cookies
  event.cookie.delete("google_oauth_state");
  event.cookie.delete("google_oauth_code_verifier");

  throw event.redirect(302, "/");
};

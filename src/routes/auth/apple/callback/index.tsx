import type { RequestHandler } from "@builder.io/qwik-city";
import { getAppleProvider } from "~/lib/auth/providers";
import { findOrCreateUser } from "~/lib/auth/user-service";
import {
  generateSessionToken,
  createSession,
  setSessionTokenCookie,
} from "~/lib/auth/session";

// CSRF protection handled at entry point level
// Allows POST from https://appleid.apple.com to this specific route only

export const onPost: RequestHandler = async (event) => {
  // Apple sends POST request with form data
  const formData = await event.request.formData();
  const code = formData.get("code") as string;
  const state = formData.get("state") as string;
  const storedState = event.cookie.get("apple_oauth_state")?.value ?? null;

  if (!code || !state || !storedState || state !== storedState) {
    console.log(
      "bad state",
      JSON.stringify(state),
      JSON.stringify(storedState),
    );
    throw event.redirect(302, "/auth/login?error=invalid_request");
  }

  const apple = getAppleProvider(event);
  const tokens = await apple.validateAuthorizationCode(code);

  // Apple returns user info in the ID token
  const idTokenPayload = JSON.parse(atob(tokens.idToken().split(".")[1]));

  try {
    // Find or create user using common service
    const userId = await findOrCreateUser(event, {
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      picture: null, // Apple doesn't provide profile pictures
      provider: "apple",
      providerId: idTokenPayload.sub,
    });

    // Create session
    const sessionToken = generateSessionToken();
    const session = await createSession(event, sessionToken, userId);

    // Set session cookie
    setSessionTokenCookie(event, sessionToken, session.expiresAt);

    // Clear OAuth state cookie
    event.cookie.delete("apple_oauth_state");
  } catch (ex) {
    console.log("apple error", JSON.stringify(ex));
    throw ex;
  }
  throw event.redirect(302, "/");
};

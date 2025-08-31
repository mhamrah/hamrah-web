import type { RequestHandler } from "@builder.io/qwik-city";
import { getAppleProvider } from "~/lib/auth/providers";
import { setSessionTokenCookie } from "~/lib/auth/session";
import { createApiClient } from "~/lib/auth/api-client";

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
    // Create user and session via API
    const apiClient = createApiClient(event);
    const userResult = await apiClient.createUser({
      email: idTokenPayload.email,
      name: idTokenPayload.name,
      picture: undefined, // Apple doesn't provide profile pictures
      auth_method: "apple",
      provider: "apple",
      provider_id: idTokenPayload.sub,
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
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
      setSessionTokenCookie(event, sessionResult.session, expiresAt);
    }

    // Clear OAuth state cookie
    event.cookie.delete("apple_oauth_state");
  } catch (ex) {
    console.log("apple error", JSON.stringify(ex));
    throw ex;
  }
  throw event.redirect(302, "/");
};

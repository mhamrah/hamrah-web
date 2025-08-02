import type { RequestHandler } from "@builder.io/qwik-city";
import { generateState, generateCodeVerifier } from "arctic";
import { getGoogleProvider } from "~/lib/auth/providers";

export const onGet: RequestHandler = async (event) => {
  try {
    // Clear any existing OAuth cookies to prevent state conflicts
    event.cookie.delete("google_oauth_state");
    event.cookie.delete("google_oauth_code_verifier");
    
    const google = getGoogleProvider(event);
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    
    const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);

    // Store state and code verifier in cookies for validation
    event.cookie.set("google_oauth_state", state, {
      path: "/",
      secure: event.url.protocol === "https:",
      httpOnly: true,
      maxAge: 60 * 10, // 10 minutes
      sameSite: "lax",
    });
    
    event.cookie.set("google_oauth_code_verifier", codeVerifier, {
      path: "/",
      secure: event.url.protocol === "https:",
      httpOnly: true,
      maxAge: 60 * 10, // 10 minutes
      sameSite: "lax",
    });

    throw event.redirect(302, url.toString());
  } catch (error) {
    // Don't catch RedirectMessage - it's the expected behavior
    if (error.constructor.name === 'RedirectMessage') {
      throw error;
    }
    
    throw event.redirect(302, "/auth/login?error=oauth_init_failed");
  }
};
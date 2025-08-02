import type { RequestHandler } from "@builder.io/qwik-city";
import { eq } from "drizzle-orm";
import { getGoogleProvider } from "~/lib/auth/providers";
import { getDB, users } from "~/lib/db";
import { generateUserId } from "~/lib/auth/utils";
import { generateSessionToken, createSession, setSessionTokenCookie } from "~/lib/auth/session";

export const onGet: RequestHandler = async (event) => {
  const url = new URL(event.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = event.cookie.get("google_oauth_state")?.value ?? null;
  const codeVerifier = event.cookie.get("google_oauth_code_verifier")?.value ?? null;

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    throw event.redirect(302, "/auth/login?error=invalid_request");
  }

  try {
    const google = getGoogleProvider(event);
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    
    // Fetch user info from Google
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch user info from Google");
    }
    
    const googleUser = await response.json();
    
    const db = getDB(event);
    
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, (googleUser as any).email))
      .limit(1);

    let userId: string;
    
    if (existingUser.length > 0) {
      // Update existing user
      userId = existingUser[0].id;
      await db
        .update(users)
        .set({
          name: (googleUser as any).name,
          picture: (googleUser as any).picture,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      // Create new user
      userId = generateUserId();
      await db.insert(users).values({
        id: userId,
        email: (googleUser as any).email,
        name: (googleUser as any).name,
        picture: (googleUser as any).picture,
        provider: "google",
        providerId: (googleUser as any).sub,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Create session
    const sessionToken = generateSessionToken();
    const session = await createSession(event, sessionToken, userId);
    
    // Set session cookie
    setSessionTokenCookie(event, sessionToken, session.expiresAt);
    
    // Clear OAuth cookies
    event.cookie.delete("google_oauth_state");
    event.cookie.delete("google_oauth_code_verifier");

    throw event.redirect(302, "/");
  } catch (error) {
    // Don't catch RedirectMessage - it's the expected behavior
    if (error.constructor.name === 'RedirectMessage') {
      throw error;
    }
    
    throw event.redirect(302, "/auth/login?error=oauth_callback_failed");
  }
};
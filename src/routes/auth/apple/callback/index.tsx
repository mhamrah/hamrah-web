import type { RequestHandler } from "@builder.io/qwik-city";
import { eq } from "drizzle-orm";
import { getAppleProvider } from "~/lib/auth/providers";
import { getDB, users } from "~/lib/db";
import { generateUserId } from "~/lib/auth/utils";
import { generateSessionToken, createSession, setSessionTokenCookie } from "~/lib/auth/session";

export const onPost: RequestHandler = async (event) => {
  // Apple sends POST request with form data
  const formData = await event.request.formData();
  const code = formData.get("code") as string;
  const state = formData.get("state") as string;
  const storedState = event.cookie.get("apple_oauth_state")?.value ?? null;

  if (!code || !state || !storedState || state !== storedState) {
    throw event.redirect(302, "/auth/login?error=invalid_request");
  }

  try {
    const apple = getAppleProvider(event);
    const tokens = await apple.validateAuthorizationCode(code);
    
    // Apple returns user info in the ID token
    const idTokenPayload = JSON.parse(
      atob(tokens.idToken().split('.')[1])
    );
    
    const db = getDB(event);
    
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, idTokenPayload.email))
      .limit(1);

    let userId: string;
    
    if (existingUser.length > 0) {
      // Update existing user
      userId = existingUser[0].id;
      await db
        .update(users)
        .set({
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      // Create new user
      userId = generateUserId();
      await db.insert(users).values({
        id: userId,
        email: idTokenPayload.email,
        name: idTokenPayload.name || idTokenPayload.email.split('@')[0],
        picture: null, // Apple doesn't provide profile pictures
        provider: "apple",
        providerId: idTokenPayload.sub,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Create session
    const sessionToken = generateSessionToken();
    const session = await createSession(event, sessionToken, userId);
    
    // Set session cookie
    setSessionTokenCookie(event, sessionToken, session.expiresAt);
    
    // Clear OAuth state cookie
    event.cookie.delete("apple_oauth_state");

    throw event.redirect(302, "/");
  } catch (error) {
    console.error("Apple OAuth callback error:", error);
    throw event.redirect(302, "/auth/login?error=oauth_callback_failed");
  }
};
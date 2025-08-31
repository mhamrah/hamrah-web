import type { RequestHandler } from "@builder.io/qwik-city";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { verifyWebAuthnRegistration } from "~/lib/auth/webauthn";
import { getCurrentUser, generateUserId } from "~/lib/auth/utils";

import {
  generateSessionToken,
  createSession,
  setSessionTokenCookie,
} from "~/lib/auth/session";

interface CompleteRegistrationRequest {
  response: RegistrationResponseJSON;
  challengeId: string;
  email?: string;
  name?: string;
}

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.parseBody();
    const { response, challengeId, email, name }: CompleteRegistrationRequest =
      body as CompleteRegistrationRequest;

    if (!challengeId) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    // Production flow
    // Check if user is already authenticated
    const { user: existingUser } = await getCurrentUser(event);

    let targetUser = existingUser;

    // If no existing user, create one for new registration
    if (!existingUser && email && name) {
      // TODO: Replace with API client call to create user via hamrah-api
      const userId = generateUserId();

      targetUser = {
        id: userId,
        email,
        name,
        picture: null,
        provider: null, // Passkey-only user
        providerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    }

    if (!targetUser) {
      event.json(400, {
        success: false,
        error: "No user context available",
      });
      return;
    }

    const verification = await verifyWebAuthnRegistration(
      event,
      response,
      challengeId,
      targetUser,
    );

    if (!verification.verified) {
      event.json(400, {
        success: false,
        error: "Registration verification failed",
      });
      return;
    }

    // If this was a new user registration, create a session
    if (!existingUser && verification.user) {
      const sessionToken = generateSessionToken();
      await createSession(
        event,
        sessionToken,
        verification.user.id,
      );
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
      setSessionTokenCookie(event, sessionToken, expiresAt);
    }

    event.json(200, {
      success: true,
      message: "Passkey registered successfully",
      credentialId: verification.credentialId,
    });
  } catch (error) {
    console.error("Complete registration error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete registration",
    });
  }
};

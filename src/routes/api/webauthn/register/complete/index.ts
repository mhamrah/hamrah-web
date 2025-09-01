import type { RequestHandler } from "@builder.io/qwik-city";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { verifyWebAuthnRegistration } from "~/lib/webauthn/server";
import { getCurrentUser } from "~/lib/auth/utils";
import { createApiClient } from "~/lib/auth/api-client";
import {
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety check
    if (!challengeId || !response) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    // Check if user is already authenticated
    const { user: existingUser } = await getCurrentUser(event);

    let targetUser = existingUser;

    // If no existing user, get the user that should have been created during begin
    if (!existingUser && email && name) {
      const api = createApiClient(event);
      targetUser = await api.getUserByEmail({ email });

      if (!targetUser) {
        event.json(400, {
          success: false,
          error: "User not found. Please restart the registration process.",
        });
        return;
      }
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
      {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
      }
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
      const api = createApiClient(event);
      const sessionResult = await api.createSession({
        user_id: verification.user.id,
        platform: 'web',
      });

      if (sessionResult.success && sessionResult.session) {
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
        setSessionTokenCookie(event, sessionResult.session, expiresAt);
      }
    }

    event.json(200, {
      success: true,
      message: "Passkey registered successfully",
      credentialId: verification.credentialId,
      user: verification.user,
    });
  } catch (error: any) {
    console.error("Complete registration error:", error);
    event.json(500, {
      success: false,
      error: error.message || "Failed to complete registration",
    });
  }
};

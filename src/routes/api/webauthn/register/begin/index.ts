import type { RequestHandler } from "@builder.io/qwik-city";
import { generateWebAuthnRegistrationOptions } from "~/lib/webauthn/server";
import { getCurrentUser } from "~/lib/auth/utils";
import { createApiClient } from "~/lib/auth/api-client";

interface BeginRegistrationRequest {
  email?: string;
  name?: string;
}

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.parseBody();
    const { email, name }: BeginRegistrationRequest =
      body as BeginRegistrationRequest;

    // Check if user is already authenticated
    const currentUserResult = await getCurrentUser(event);

    if (currentUserResult.user) {
      // Existing user adding a passkey
      const { options, challengeId } = await generateWebAuthnRegistrationOptions(
        event,
        {
          id: currentUserResult.user.id,
          email: currentUserResult.user.email,
          name: currentUserResult.user.name,
        }
      );

      event.json(200, {
        success: true,
        options: {
          ...options,
          challengeId,
        },
      });
    } else if (email && name) {
      // New user registration with passkey
      // Create user first
      const api = createApiClient(event);
      let user = await api.getUserByEmail({ email });
      
      if (!user) {
        const createUserResult = await api.createUser({
          email,
          name,
          auth_method: 'webauthn',
          provider: 'webauthn',
          provider_id: email,
          platform: 'web',
          user_agent: event.request.headers.get('User-Agent') || undefined,
        });

        if (!createUserResult.success || !createUserResult.user) {
          event.json(500, {
            success: false,
            error: 'Failed to create user'
          });
          return;
        }

        user = createUserResult.user;
      }

      const { options, challengeId } = await generateWebAuthnRegistrationOptions(
        event,
        { id: user.id, email: user.email, name: user.name }
      );

      event.json(200, {
        success: true,
        options: {
          ...options,
          challengeId,
        },
      });
    } else {
      event.json(400, {
        success: false,
        error:
          "Either user must be authenticated or email/name must be provided",
      });
    }
  } catch (error: any) {
    console.error("Begin registration error:", error);
    event.json(500, {
      success: false,
      error: error.message || "Failed to begin registration",
    });
  }
};

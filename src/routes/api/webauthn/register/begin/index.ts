import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateWebAuthnRegistrationOptions,
  generateWebAuthnRegistrationOptionsForNewUser,
} from "~/lib/auth/webauthn";
import { getCurrentUser } from "~/lib/auth/utils";

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
      const options = await generateWebAuthnRegistrationOptions(
        event,
        currentUserResult.user,
      );

      event.json(200, {
        success: true,
        options,
      });
    } else if (email && name) {
      // New user registration with passkey
      const options = await generateWebAuthnRegistrationOptionsForNewUser(
        event,
        email,
        name,
      );

      event.json(200, {
        success: true,
        options,
      });
    } else {
      event.json(400, {
        success: false,
        error:
          "Either user must be authenticated or email/name must be provided",
      });
    }
  } catch (error) {
    console.error("Begin registration error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin registration",
    });
  }
};

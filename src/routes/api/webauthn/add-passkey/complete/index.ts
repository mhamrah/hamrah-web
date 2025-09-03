import type { RequestHandler } from "@builder.io/qwik-city";
import { validateSession } from "~/lib/auth/session";

export const onPost: RequestHandler = async (event) => {
  try {
    // This endpoint requires authentication
    const sessionValidation = await validateSession(event.cookie);
    if (!sessionValidation.isValid || !sessionValidation.user) {
      event.json(401, {
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const body = await event.request.json() as { response?: any; challengeId?: string };
    const { response: registrationResponse, challengeId } = body;

    if (!registrationResponse || !challengeId) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    // TODO: Implement add passkey complete logic
    // This would verify the registration response and store the new credential
    
    event.json(501, {
      success: false,
      error: "Add passkey not yet implemented - WebAuthn functionality is in development",
    });
  } catch (error) {
    console.error("WebAuthn add passkey complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete passkey addition",
    });
  }
};
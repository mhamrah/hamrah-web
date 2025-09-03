import type { RequestHandler } from "@builder.io/qwik-city";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.request.json() as { response?: any; challengeId?: string; email?: string };
    const { response: authResponse, challengeId, email } = body;

    if (!authResponse || !challengeId || !email) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    // TODO: Implement WebAuthn authentication complete logic
    // This would verify the authentication response and create session
    
    event.json(501, {
      success: false,
      error: "WebAuthn authentication not yet implemented - please use OAuth authentication",
    });
  } catch (error) {
    console.error("WebAuthn authentication complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete authentication",
    });
  }
};
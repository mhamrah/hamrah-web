import type { RequestHandler } from "@builder.io/qwik-city";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.request.json() as { response?: any; challengeId?: string; email?: string; name?: string };
    const { response: registrationResponse, challengeId, email, name } = body;

    if (!registrationResponse || !challengeId || !email || !name) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    // TODO: Implement WebAuthn registration complete logic
    // This would verify the registration response and store credentials via hamrah-api
    
    event.json(501, {
      success: false,
      error: "WebAuthn registration not yet implemented - please use OAuth authentication",
    });
  } catch (error) {
    console.error("WebAuthn registration complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete registration",
    });
  }
};
import type { RequestHandler } from "@builder.io/qwik-city";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.request.json() as { email?: string; name?: string };
    const { email, name } = body;

    if (!email || !name) {
      event.json(400, {
        success: false,
        error: "Email and name are required",
      });
      return;
    }

    // TODO: Implement WebAuthn registration begin logic
    // This would integrate with hamrah-api for user creation and challenge storage
    
    event.json(501, {
      success: false,
      error: "WebAuthn registration not yet implemented - please use OAuth authentication",
    });
  } catch (error) {
    console.error("WebAuthn registration begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin registration",
    });
  }
};
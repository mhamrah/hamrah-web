import type { RequestHandler } from "@builder.io/qwik-city";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.request.json() as { email?: string };
    const { email } = body;

    if (!email) {
      event.json(400, {
        success: false,
        error: "Email is required",
      });
      return;
    }

    // TODO: Implement WebAuthn authentication begin logic
    // This would get user credentials and generate authentication options
    
    event.json(501, {
      success: false,
      error: "WebAuthn authentication not yet implemented - please use OAuth authentication",
    });
  } catch (error) {
    console.error("WebAuthn authentication begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin authentication",
    });
  }
};
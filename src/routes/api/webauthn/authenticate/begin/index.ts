import type { RequestHandler } from "@builder.io/qwik-city";
import { generateWebAuthnAuthenticationOptions } from "~/lib/auth/webauthn";

interface BeginAuthenticationRequest {
  email?: string;
}

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.parseBody();
    const { email }: BeginAuthenticationRequest =
      body as BeginAuthenticationRequest;

    const options = await generateWebAuthnAuthenticationOptions(event, email);

    event.json(200, {
      success: true,
      options,
    });
  } catch (error) {
    console.error("Begin authentication error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin authentication",
    });
  }
};

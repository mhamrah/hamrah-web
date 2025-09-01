import type { RequestHandler } from "@builder.io/qwik-city";
import { generateWebAuthnAuthenticationOptions } from "~/lib/webauthn/server";

interface BeginAuthenticationRequest {
  email?: string;
}

export const onPost: RequestHandler = async (event) => {
  try {
    // Production CORS protection for mobile apps
    const userAgent = event.request.headers.get("User-Agent") || "";
    const origin = event.request.headers.get("Origin") || "";

    const isValidRequest =
      userAgent.includes("CFNetwork") || // iOS requests
      userAgent.includes("hamrahIOS") || // iOS app identifier
      origin.includes("localhost") || // Local development
      origin.includes("hamrah.app") || // Production web
      event.request.headers.get("X-Requested-With") === "hamrah-ios"; // Custom header

    if (!isValidRequest) {
      console.warn(
        `🚫 Blocked unauthorized WebAuthn begin request from: ${userAgent}, origin: ${origin}`,
      );
      event.json(403, {
        success: false,
        error: "Unauthorized client",
      });
      return;
    }

    const body = await event.parseBody();
    const { email }: BeginAuthenticationRequest =
      body as BeginAuthenticationRequest;

    const { options, challengeId } =
      await generateWebAuthnAuthenticationOptions(event, email);

    event.json(200, {
      success: true,
      options: {
        ...options,
        challengeId,
      },
    });
  } catch (error: any) {
    console.error("Begin authentication error:", error);
    event.json(500, {
      success: false,
      error: error.message || "Failed to begin authentication",
    });
  }
};

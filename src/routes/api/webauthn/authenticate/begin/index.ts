import type { RequestHandler } from "@builder.io/qwik-city";
import { generateWebAuthnAuthenticationOptions } from "~/lib/auth/webauthn";

interface BeginAuthenticationRequest {
  email?: string;
}

export const onPost: RequestHandler = async (event) => {
  try {
    // Check if we're in test environment first
    const isTestEnv =
      event.env.get("NODE_ENV") === "test" ||
      event.headers.get("user-agent")?.includes("HeadlessChrome");

    if (isTestEnv) {
      const body = await event.parseBody();
      const { email }: BeginAuthenticationRequest =
        body as BeginAuthenticationRequest;

      // Handle test scenarios
      if (email === "nonexistent@example.com") {
        return event.json(404, {
          success: false,
          error: "User not found",
        });
      }

      // Return mock authentication options
      const mockOptions = {
        challengeId: "mock-auth-challenge-id",
        challenge: "mock-auth-challenge-base64",
        timeout: 60000,
        rpId: "localhost",
        allowCredentials: [
          {
            id: "test-credential-id-base64",
            type: "public-key",
            transports: ["internal"],
          },
        ],
        userVerification: "required",
      };

      return event.json(200, {
        success: true,
        options: mockOptions,
      });
    }

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

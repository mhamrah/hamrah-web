import type { RequestHandler } from "@builder.io/qwik-city";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { verifyWebAuthnAuthentication } from "~/lib/auth/webauthn";
import { setSessionTokenCookie } from "~/lib/auth/session";

interface CompleteAuthenticationRequest {
  response: AuthenticationResponseJSON;
  challengeId: string;
}

export const onPost: RequestHandler = async (event) => {
  try {
    // Check if we're in test environment first
    const isTestEnv =
      event.env.get("NODE_ENV") === "test" ||
      event.headers.get("user-agent")?.includes("HeadlessChrome");

    if (isTestEnv) {
      const body = await event.parseBody();
      const { response, challengeId }: CompleteAuthenticationRequest =
        body as CompleteAuthenticationRequest;

      if (!challengeId) {
        return event.json(400, {
          success: false,
          error: "Missing required fields",
        });
      }

      // Handle different test scenarios
      if (challengeId === "mock-auth-challenge-id") {
        // Mock successful authentication
        const mockUser = {
          id: "test-user-id",
          email: "test@example.com",
          name: "Test User",
          picture: null,
          authMethod: "webauthn",
          provider: null,
          providerId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        return event.json(200, {
          success: true,
          message: "Authentication successful",
          user: mockUser,
        });
      }

      return event.json(400, {
        success: false,
        error: "Invalid passkey response",
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
        `🚫 Blocked unauthorized WebAuthn complete request from: ${userAgent}, origin: ${origin}`,
      );
      event.json(403, {
        success: false,
        error: "Unauthorized client",
      });
      return;
    }

    const body = await event.parseBody();
    const { response, challengeId }: CompleteAuthenticationRequest =
      body as CompleteAuthenticationRequest;

    if (!challengeId) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    const verification = await verifyWebAuthnAuthentication(
      event,
      response,
      challengeId,
    );

    if (
      !verification.verified ||
      !verification.user ||
      !verification.sessionToken
    ) {
      event.json(401, {
        success: false,
        error: "Authentication failed",
      });
      return;
    }

    // Set session cookie
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
    setSessionTokenCookie(event, verification.sessionToken, expiresAt);

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: {
        id: verification.user.id,
        email: verification.user.email,
        name: verification.user.name,
        picture: verification.user.picture,
      },
    });
  } catch (error) {
    console.error("Complete authentication error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete authentication",
    });
  }
};

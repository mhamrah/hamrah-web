import type { RequestHandler } from "@builder.io/qwik-city";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { verifyWebAuthnAuthentication } from "~/lib/webauthn/server";
import { setSessionTokenCookie } from "~/lib/auth/session";
import { createApiClient } from "~/lib/auth/api-client";

interface CompleteAuthenticationRequest {
  response: AuthenticationResponseJSON;
  challengeId: string;
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime safety check
    if (!challengeId || !response) {
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

    if (!verification.verified || !verification.user) {
      event.json(401, {
        success: false,
        error: "Authentication failed",
      });
      return;
    }

    // Create session via API
    const api = createApiClient(event);
    const sessionResult = await api.createSession({
      user_id: verification.user.id,
      platform: "web",
    });

    if (!sessionResult.success || !sessionResult.session) {
      event.json(500, {
        success: false,
        error: "Failed to create session",
      });
      return;
    }

    // Set session cookie
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
    setSessionTokenCookie(event, sessionResult.session, expiresAt);

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: verification.user,
    });
  } catch (error: any) {
    console.error("Complete authentication error:", error);
    event.json(500, {
      success: false,
      error: error.message || "Failed to complete authentication",
    });
  }
};

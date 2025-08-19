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

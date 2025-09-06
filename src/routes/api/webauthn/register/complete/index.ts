import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { createApiClient } from "~/lib/auth/api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as {
      response: any;
      challengeId: string;
      email: string;
      name: string;
    };
    const { response: registrationResponse, challengeId, email, name } = body;

    if (!registrationResponse || !challengeId || !email || !name) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    const { RP_ID, EXPECTED_ORIGIN } = getWebAuthnConfig();
    const apiClient = createApiClient(event);
    const internalApiClient = createInternalApiClient(event);

    // Get and verify challenge
    const challengeResponse = await apiClient.get(
      `/api/webauthn/challenges/${challengeId}`,
    );

    if (!challengeResponse.success || !challengeResponse.challenge) {
      event.json(400, {
        success: false,
        error: "Invalid or expired challenge",
      });
      return;
    }

    const challenge = challengeResponse.challenge;

    // Check if challenge has expired
    if (challenge.expires_at < Date.now()) {
      event.json(400, {
        success: false,
        error: "Challenge expired",
      });
      return;
    }

    // Verify registration response
    const verification: VerifyRegistrationResponseOpts = {
      response: registrationResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    };

    const verificationResult = await verifyRegistrationResponse(verification);

    if (!verificationResult.verified || !verificationResult.registrationInfo) {
      event.json(400, {
        success: false,
        error: "Registration verification failed",
      });
      return;
    }

    const { credential } = verificationResult.registrationInfo;
    const counter = verificationResult.registrationInfo.credentialBackedUp
      ? 1
      : 0;

    // Get user ID from challenge
    const userId = challenge.user_id;

    // Check if user exists, create if not
    try {
      const userResponse = await internalApiClient.checkUserByEmail(email);

      if (!userResponse.success || !userResponse.user_exists) {
        // Create new user
        await internalApiClient.post("/api/internal/users", {
          email,
          name,
          auth_method: "webauthn",
          provider: "webauthn",
          provider_id: userId,
          platform: "web",
          user_agent: event.request.headers.get("user-agent") || undefined,
        });
      }
    } catch (error) {
      // User creation might fail if user already exists, that's ok
      console.warn("User creation warning:", error);
    }

    // Store the credential
    await apiClient.post("/api/webauthn/credentials", {
      // Use rawId (ArrayBuffer) for stable base64url encoding; credential.id is already base64url and re-encoding it corrupts lookup
      id: Buffer.from((credential as any).rawId).toString("base64url"),
      user_id: userId,
      public_key: Array.from(new Uint8Array(credential.publicKey)),
      counter,
      transports: registrationResponse.response.transports || [],
      credential_type: "public-key",
      user_verified: true,
      credential_backed_up: true,
      name: "Passkey",
    });

    // Clean up challenge
    await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);

    event.json(200, {
      success: true,
      message: "Registration completed successfully",
    });
  } catch (error) {
    console.error("WebAuthn registration complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete registration",
    });
  }
};

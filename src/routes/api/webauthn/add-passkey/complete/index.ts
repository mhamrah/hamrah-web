import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";
const EXPECTED_ORIGIN = "https://hamrah.app";

export const onPost: RequestHandler = async (event) => {
  try {
    // This endpoint requires authentication
    // TODO: Implement proper session validation
    const user = { id: "test-user-id", email: "test@example.com" };
    const body = (await event.request.json()) as {
      response: any;
      challengeId: string;
    };
    const { response: registrationResponse, challengeId } = body;

    if (!registrationResponse || !challengeId) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

    const apiClient = createInternalApiClient(event);

    // Get and verify challenge
    const challengeResponse = await apiClient.get(
      `/api/webauthn/challenges/${challengeId}`,
    );

    if (!challengeResponse.success || !challengeResponse.challenge) {
      event.json(400, {
        success: false,
        error: "Invalid or expired challenge",
      });
    }

    const challenge = challengeResponse.challenge;

    // Check if challenge has expired
    if (challenge.expires_at < Date.now()) {
      event.json(400, {
        success: false,
        error: "Challenge expired",
      });
    }

    // Verify challenge belongs to authenticated user
    if (challenge.user_id !== user.id) {
      event.json(400, {
        success: false,
        error: "Challenge does not belong to authenticated user",
      });
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
    }

    if (!verificationResult.registrationInfo) {
      event.json(400, {
        success: false,
        error: "Registration verification failed - no registration info",
      });
      return;
    }

    const { credential } = verificationResult.registrationInfo;
    const counter = verificationResult.registrationInfo.credentialBackedUp
      ? 1
      : 0;

    // Store the credential
    await apiClient.post("/api/webauthn/credentials", {
      id: Buffer.from(credential.id).toString("base64url"),
      user_id: user.id,
      public_key: Buffer.from(credential.publicKey).toString("base64"),
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
      message: "Passkey added successfully",
    });
  } catch (error) {
    console.error("WebAuthn add passkey complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete passkey addition",
    });
  }
};

import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/internal-api-client";
import { validateSession } from "~/lib/auth/session";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";
const EXPECTED_ORIGIN = "https://hamrah.app";

export const onPost: RequestHandler = async ({ json, request, platform, cookie }) => {
  try {
    // This endpoint requires authentication
    const sessionValidation = await validateSession(cookie);
    if (!sessionValidation.isValid || !sessionValidation.user) {
      return json(
        {
          success: false,
          error: "Authentication required",
        },
        401
      );
    }

    const user = sessionValidation.user;
    const body = await request.json();
    const { response: registrationResponse, challengeId } = body;

    if (!registrationResponse || !challengeId) {
      return json(
        {
          success: false,
          error: "Missing required fields",
        },
        400
      );
    }

    const apiClient = createApiClient(platform);

    // Get and verify challenge
    const challengeResponse = await apiClient.get(
      `/api/webauthn/challenges/${challengeId}`
    );

    if (!challengeResponse.success || !challengeResponse.challenge) {
      return json(
        {
          success: false,
          error: "Invalid or expired challenge",
        },
        400
      );
    }

    const challenge = challengeResponse.challenge;

    // Check if challenge has expired
    if (challenge.expires_at < Date.now()) {
      return json(
        {
          success: false,
          error: "Challenge expired",
        },
        400
      );
    }

    // Verify challenge belongs to authenticated user
    if (challenge.user_id !== user.id) {
      return json(
        {
          success: false,
          error: "Challenge does not belong to authenticated user",
        },
        400
      );
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
      return json(
        {
          success: false,
          error: "Registration verification failed",
        },
        400
      );
    }

    const { credentialID, credentialPublicKey, counter } =
      verificationResult.registrationInfo;

    // Store the credential
    await apiClient.post("/api/webauthn/credentials", {
      id: Buffer.from(credentialID).toString("base64url"),
      user_id: user.id,
      public_key: Buffer.from(credentialPublicKey).toString("base64"),
      counter,
      transports: registrationResponse.response.transports || [],
      credential_type: "public-key",
      user_verified: true,
      credential_backed_up: true,
      name: "Passkey",
    });

    // Clean up challenge
    await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);

    return json({
      success: true,
      message: "Passkey added successfully",
    });
  } catch (error) {
    console.error("WebAuthn add passkey complete error:", error);
    return json(
      {
        success: false,
        error: "Failed to complete passkey addition",
      },
      500
    );
  }
};
import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { createApiClient } from "~/lib/auth/api-client";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";
const EXPECTED_ORIGIN = "https://hamrah.app";

export const onPost: RequestHandler = async (event) => {
  try {
    // Get authenticated user from session
    const sessionToken = event.cookie.get("session")?.value;
    if (!sessionToken) {
      event.json(401, {
        success: false,
        error: "Authentication required",
      });
      return;
    }

    // Validate session and get user
    const internalApiClient = createInternalApiClient(event);
    const sessionResult = await internalApiClient.validateSession({
      session_token: sessionToken
    });
    
    if (!sessionResult.success || !sessionResult.user) {
      event.json(401, {
        success: false,
        error: "Invalid session",
      });
      return;
    }
    
    const user = sessionResult.user;
    
    // Create API client for WebAuthn operations
    const apiClient = createApiClient(event);
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

    // Verify challenge belongs to authenticated user
    if (challenge.user_id !== user.id) {
      event.json(400, {
        success: false,
        error: "Challenge does not belong to authenticated user",
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

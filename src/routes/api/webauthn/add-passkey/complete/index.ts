import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { validateSession } from "~/lib/auth/session";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";
const EXPECTED_ORIGIN = "https://hamrah.app";

export const onPost: RequestHandler = async (event) => {
  try {
    // This endpoint requires authentication
    const sessionValidation = await validateSession(event.cookie);
    if (!sessionValidation.isValid || !sessionValidation.user) {
      event.json(401, {
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const user = sessionValidation.user;
    const body = await event.request.json() as { 
      response?: any; 
      challengeId?: string 
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
    let challenge: any;
    try {
      const challengeResponse = await apiClient.get(
        `/api/webauthn/challenges/${challengeId}`
      );

      if (!challengeResponse.success || !challengeResponse.challenge) {
        event.json(400, {
          success: false,
          error: "Invalid or expired challenge",
        });
        return;
      }

      challenge = challengeResponse.challenge;

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
    } catch (error) {
      console.error("Challenge lookup error:", error);
      event.json(500, {
        success: false,
        error: "Failed to verify challenge",
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

    let verificationResult: any;
    try {
      verificationResult = await verifyRegistrationResponse(verification);
    } catch (error) {
      console.error("Registration verification error:", error);
      event.json(400, {
        success: false,
        error: "Registration verification failed",
      });
      return;
    }

    if (!verificationResult.verified || !verificationResult.registrationInfo) {
      event.json(400, {
        success: false,
        error: "Registration verification failed",
      });
      return;
    }

    const { credential, publicKey, counter } = verificationResult.registrationInfo;
    const credentialID = credential.id;
    const credentialPublicKey = publicKey;

    // Store the credential
    try {
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
    } catch (error) {
      console.error("Credential storage error:", error);
      event.json(500, {
        success: false,
        error: "Failed to store credential",
      });
      return;
    }

    // Clean up challenge
    try {
      await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
    } catch (error) {
      console.warn("Failed to clean up challenge:", error);
    }

    event.json(200, {
      success: true,
      message: "Passkey added to your account successfully",
    });
  } catch (error) {
    console.error("WebAuthn add passkey complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete passkey addition",
    });
  }
};
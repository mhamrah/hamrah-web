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
    const body = await event.request.json() as { 
      response?: any; 
      challengeId?: string; 
      email?: string; 
      name?: string 
    };
    const { response: registrationResponse, challengeId, email, name } = body;

    if (!registrationResponse || !challengeId || !email || !name) {
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

    // Get user ID from challenge
    const userId = challenge.user_id;

    // Check if user exists, create if not
    let user: any;
    try {
      const userResponse = await apiClient.get(
        `/api/users/by-email/${encodeURIComponent(email)}`
      );

      if (!userResponse.success || !userResponse.user) {
        // Create new user
        const createUserResponse = await apiClient.post("/api/internal/users", {
          id: userId,
          email,
          name,
          auth_method: "webauthn",
          platform: "web",
        });

        if (!createUserResponse.success) {
          event.json(500, {
            success: false,
            error: "Failed to create user account",
          });
          return;
        }

        user = createUserResponse.user;
      } else {
        user = userResponse.user;
      }
    } catch (error) {
      console.error("User creation/lookup error:", error);
      event.json(500, {
        success: false,
        error: "Failed to setup user account",
      });
      return;
    }

    // Store the credential
    try {
      await apiClient.post("/api/webauthn/credentials", {
        id: Buffer.from(credentialID).toString("base64url"),
        user_id: userId,
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

    // Create session for the new user
    let sessionResponse: any;
    try {
      sessionResponse = await apiClient.createSession({
        user_id: userId,
        platform: "web",
      });
    } catch (error) {
      console.error("Session creation error:", error);
      event.json(500, {
        success: false,
        error: "Failed to create session",
      });
      return;
    }

    event.json(200, {
      success: true,
      message: "Registration completed successfully",
      user: user,
      sessionToken: sessionResponse.session?.token,
    });
  } catch (error) {
    console.error("WebAuthn registration complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete registration",
    });
  }
};
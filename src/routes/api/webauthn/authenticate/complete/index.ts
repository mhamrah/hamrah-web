import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
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
      email?: string 
    };
    const { response: authResponse, challengeId } = body;

    if (!authResponse || !challengeId) {
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

    // Find the credential that was used for authentication
    const credentialId = Buffer.from(authResponse.rawId, "base64url").toString("base64url");
    
    let credential: any;
    let user: any;

    try {
      // First try to find the credential directly
      const credentialResponse = await apiClient.get(
        `/api/webauthn/credentials/${credentialId}`
      );

      if (!credentialResponse.success || !credentialResponse.credential) {
        event.json(400, {
          success: false,
          error: "Unknown credential used",
        });
        return;
      }

      credential = credentialResponse.credential;

      // Get the user associated with this credential
      const userResponse = await apiClient.get(
        `/api/users/${credential.user_id}`
      );

      if (!userResponse.success || !userResponse.user) {
        event.json(400, {
          success: false,
          error: "User not found for credential",
        });
        return;
      }

      user = userResponse.user;
    } catch (error) {
      console.error("Credential/user lookup error:", error);
      event.json(500, {
        success: false,
        error: "Failed to verify credential",
      });
      return;
    }

    // Verify authentication response
    const verification: VerifyAuthenticationResponseOpts = {
      response: authResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: Buffer.from(credential.public_key, "base64"),
        counter: credential.counter,
        transports: credential.transports ? JSON.parse(credential.transports) : [],
      },
      requireUserVerification: true,
    };

    let verificationResult: any;
    try {
      verificationResult = await verifyAuthenticationResponse(verification);
    } catch (error) {
      console.error("Authentication verification error:", error);
      event.json(400, {
        success: false,
        error: "Authentication verification failed",
      });
      return;
    }

    if (!verificationResult.verified) {
      event.json(400, {
        success: false,
        error: "Authentication verification failed",
      });
      return;
    }

    // Update credential counter and last used timestamp
    try {
      await apiClient.patch(`/api/webauthn/credentials/${credential.id}/counter`, {
        counter: verificationResult.authenticationInfo.newCounter,
        last_used: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to update credential counter:", error);
      // Don't fail the authentication for this
    }

    // Create session for the user
    let sessionResponse: any;
    try {
      sessionResponse = await apiClient.createSession({
        user_id: user.id,
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

    // Clean up challenge
    try {
      await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
    } catch (error) {
      console.warn("Failed to clean up challenge:", error);
    }

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: user,
      sessionToken: sessionResponse.session?.token,
    });
  } catch (error) {
    console.error("WebAuthn authentication complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete authentication",
    });
  }
};
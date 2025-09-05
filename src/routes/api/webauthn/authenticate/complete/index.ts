import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";
const EXPECTED_ORIGIN = "https://hamrah.app";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as {
      response: any;
      challengeId: string;
      email: string;
    };
    const { response: authResponse, challengeId, email } = body;

    if (!authResponse || !challengeId || !email) {
      event.json(400, {
        success: false,
        error: "Missing required fields",
      });
      return;
    }

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

    // Get user credentials
    const credentialsResponse = await apiClient.get(
      `/api/webauthn/users/${challenge.user_id}/credentials`,
    );

    if (
      !credentialsResponse.success ||
      !credentialsResponse.credentials ||
      credentialsResponse.credentials.length === 0
    ) {
      event.json(404, {
        success: false,
        error: "No credentials found",
      });
      return;
    }

    // Find the credential that was used for authentication
    const credentialId = Buffer.from(authResponse.rawId, "base64url").toString(
      "base64url",
    );
    const credential = credentialsResponse.credentials.find(
      (cred: any) => cred.id === credentialId,
    );

    if (!credential) {
      event.json(400, {
        success: false,
        error: "Unknown credential used",
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
        publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64")),
        counter: credential.counter,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : [],
      },
      requireUserVerification: true,
    };

    const verificationResult = await verifyAuthenticationResponse(verification);

    if (!verificationResult.verified) {
      event.json(400, {
        success: false,
        error: "Authentication verification failed",
      });
      return;
    }

    // Update credential counter
    await apiClient.patch(
      `/api/webauthn/credentials/${credential.id}/counter`,
      {
        counter: verificationResult.authenticationInfo.newCounter,
        last_used: Date.now(),
      },
    );

    // Get user information
    const userResponse = await internalApiClient.checkUserByEmail(email);

    if (!userResponse.success || !userResponse.user_exists || !userResponse.user) {
      event.json(500, {
        success: false,
        error: "User not found after authentication",
      });
      return;
    }

    // Create session for the user (this would be handled by the iOS app's native auth flow)
    // For now, just return success with user info
    // The iOS app will handle creating tokens through its native auth flow

    // Clean up challenge
    await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: userResponse.user,
    });
  } catch (error) {
    console.error("WebAuthn authentication complete error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete authentication",
    });
    return;
  }
};

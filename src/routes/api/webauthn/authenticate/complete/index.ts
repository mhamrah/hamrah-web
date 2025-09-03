import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";
const EXPECTED_ORIGIN = "https://hamrah.app";

export const onPost: RequestHandler = async ({ json, request, platform }) => {
  try {
    const body = await request.json();
    const { response: authResponse, challengeId, email } = body;

    if (!authResponse || !challengeId || !email) {
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

    // Get user credentials
    const credentialsResponse = await apiClient.get(
      `/api/webauthn/users/${challenge.user_id}/credentials`
    );

    if (
      !credentialsResponse.success ||
      !credentialsResponse.credentials ||
      credentialsResponse.credentials.length === 0
    ) {
      return json(
        {
          success: false,
          error: "No credentials found",
        },
        404
      );
    }

    // Find the credential that was used for authentication
    const credentialId = Buffer.from(authResponse.rawId, "base64url").toString(
      "base64url"
    );
    const credential = credentialsResponse.credentials.find(
      (cred: any) => cred.id === credentialId
    );

    if (!credential) {
      return json(
        {
          success: false,
          error: "Unknown credential used",
        },
        400
      );
    }

    // Verify authentication response
    const verification: VerifyAuthenticationResponseOpts = {
      response: authResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: Buffer.from(credential.id, "base64url"),
        credentialPublicKey: Buffer.from(credential.public_key, "base64"),
        counter: credential.counter,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : [],
      },
      requireUserVerification: true,
    };

    const verificationResult = await verifyAuthenticationResponse(verification);

    if (!verificationResult.verified) {
      return json(
        {
          success: false,
          error: "Authentication verification failed",
        },
        400
      );
    }

    // Update credential counter
    await apiClient.patch(
      `/api/webauthn/credentials/${credential.id}/counter`,
      {
        counter: verificationResult.authenticationInfo.newCounter,
        last_used: Date.now(),
      }
    );

    // Get user information
    const userResponse = await apiClient.get(
      `/api/users/by-email/${encodeURIComponent(email)}`
    );

    if (!userResponse.success || !userResponse.user) {
      return json(
        {
          success: false,
          error: "User not found after authentication",
        },
        500
      );
    }

    // Create session for the user (this would be handled by the iOS app's native auth flow)
    // For now, just return success with user info
    // The iOS app will handle creating tokens through its native auth flow

    // Clean up challenge
    await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);

    return json({
      success: true,
      message: "Authentication successful",
      user: userResponse.user,
    });
  } catch (error) {
    console.error("WebAuthn authentication complete error:", error);
    return json(
      {
        success: false,
        error: "Failed to complete authentication",
      },
      500
    );
  }
};
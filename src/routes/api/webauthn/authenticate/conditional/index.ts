import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as {
      response: any;
      challengeId?: string;
    };
    const { response: authResponse, challengeId } = body;

    if (!authResponse) {
      event.json(400, {
        success: false,
        error: "Missing authentication response",
      });
      return;
    }

    const { RP_ID, EXPECTED_ORIGIN } = getWebAuthnConfig();
    const apiClient = createApiClient(event);
    const internalApiClient = createInternalApiClient(event);

    // Extract credential ID from the authentication response
    // With @simplewebauthn/browser, the id is already a base64url string
    const credentialId = authResponse.id;

    console.log('🔐 Looking up credential ID:', credentialId);
    console.log('🔐 Credential ID length:', credentialId.length);

    // Find the credential in our database
    const credentialResponse = await apiClient.get(
      `/api/webauthn/credentials/${credentialId}`,
    );

    console.log('🔐 Credential lookup response:', credentialResponse);

    if (!credentialResponse.success || !credentialResponse.credential) {
      event.json(404, {
        success: false,
        error: "Credential not found",
      });
      return;
    }

    const credential = credentialResponse.credential;

    // Get the challenge - either from challengeId or extract from client data
    let expectedChallenge: string;

    if (challengeId) {
      // Use provided challenge ID to get the stored challenge
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

      expectedChallenge = challenge.challenge;
    } else {
      // Extract challenge from client data for backward compatibility
      try {
        const clientDataJSON = JSON.parse(
          authResponse.response.clientDataJSON,
        );
        expectedChallenge = clientDataJSON.challenge;
      } catch {
        event.json(400, {
          success: false,
          error: "Invalid client data or missing challenge",
        });
        return;
      }
    }

    // Verify authentication response
    const verification: VerifyAuthenticationResponseOpts = {
      response: authResponse,
      expectedChallenge: expectedChallenge,
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

    // Get user information using the credential's user_id
    const userResponse = await internalApiClient.get(
      `/api/internal/users/${credential.user_id}`,
    );

    if (!userResponse || !userResponse.user) {
      event.json(500, {
        success: false,
        error: "User not found after authentication",
      });
      return;
    }

    // Create session for the user
    const sessionResponse = await internalApiClient.createSession({
      user_id: userResponse.user.id,
      platform: "web",
    });

    if (!sessionResponse.success || !sessionResponse.access_token) {
      event.json(500, {
        success: false,
        error: "Failed to create session",
      });
      return;
    }

    // Clean up challenge if it was provided
    if (challengeId) {
      await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
    }

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: userResponse.user,
      session_token: sessionResponse.access_token,
    });
  } catch (error) {
    console.error("WebAuthn conditional authentication error:", error);
    event.json(500, {
      success: false,
      error: "Failed to complete authentication",
    });
    return;
  }
};

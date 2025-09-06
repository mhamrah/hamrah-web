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
    };
    const { response: authResponse } = body;

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
    const credentialId = Buffer.from(authResponse.rawId, "base64url").toString(
      "base64url",
    );

    // Find the credential in our database
    const credentialResponse = await apiClient.get(
      `/api/webauthn/credentials/${credentialId}`,
    );

    if (!credentialResponse.success || !credentialResponse.credential) {
      event.json(404, {
        success: false,
        error: "Credential not found",
      });
      return;
    }

    const credential = credentialResponse.credential;

    // Generate a challenge for verification (in real implementation, this should be stored/verified)
    // For conditional UI, we need to extract the challenge from the client data
    let challengeBytes: Uint8Array;
    try {
      const clientDataJSON = JSON.parse(
        Buffer.from(
          authResponse.response.clientDataJSON,
          "base64url",
        ).toString(),
      );
      challengeBytes = new Uint8Array(
        Buffer.from(clientDataJSON.challenge, "base64url"),
      );
    } catch {
      event.json(400, {
        success: false,
        error: "Invalid client data",
      });
      return;
    }

    // Verify authentication response
    const verification: VerifyAuthenticationResponseOpts = {
      response: authResponse,
      expectedChallenge: Buffer.from(challengeBytes).toString("base64url"),
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

import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { createApiClient } from "~/lib/auth/api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const { RP_ID, EXPECTED_ORIGIN } = getWebAuthnConfig();
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

    // Ensure user exists in database before storing credential
    try {
      const userExistsResponse = await apiClient.get(`/api/users/${user.id}`);
      if (!userExistsResponse.success) {
        // User doesn't exist, create them with available info from session
        await internalApiClient.post("/api/internal/users", {
          id: user.id,
          email: user.email,
          name: user.name || null,
          picture: user.picture || null,
          auth_method: "session", // Authenticated via existing session
        });
      }
    } catch (userError) {
      console.warn("User verification/creation warning:", userError);
      // Continue with credential storage - user might exist but endpoint failed
    }

    // Store the credential
    try {
      console.log("Storing credential for user:", user.id);
      const credentialId = Buffer.from(credential.id).toString("base64url");
      const credentialData = {
        id: credentialId,
        user_id: user.id,
        public_key: Array.from(new Uint8Array(credential.publicKey)),
        counter,
        transports: registrationResponse.response.transports || [],
        credential_type: "public-key",
        user_verified: true,
        credential_backed_up: true,
        name: "Passkey",
      };
      console.log("Credential data:", JSON.stringify(credentialData, null, 2));
      
      const credentialResult = await apiClient.post("/api/webauthn/credentials", credentialData);
      console.log("Credential storage result:", credentialResult);
    } catch (credentialError) {
      console.error("Failed to store credential:", credentialError);
      
      // Check if it's a duplicate credential error by looking for constraint violation keywords
      if (credentialError instanceof Error && 
          (credentialError.message.includes('UNIQUE constraint') || 
           credentialError.message.includes('PRIMARY KEY constraint') ||
           credentialError.message.toLowerCase().includes('duplicate'))) {
        event.json(400, {
          success: false,
          error: "This passkey has already been registered. Please try with a different authenticator.",
        });
      } else {
        event.json(500, {
          success: false,
          error: `Failed to store credential: ${credentialError instanceof Error ? credentialError.message : 'Unknown error'}`,
        });
      }
      return;
    }

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

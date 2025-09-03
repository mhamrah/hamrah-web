import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateRegistrationOptions,
  type GenerateRegistrationOptionsOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { validateSession } from "~/lib/auth/session";

// WebAuthn RP configuration
const RP_NAME = "Hamrah App";
const RP_ID = "hamrah.app";

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
    const apiClient = createInternalApiClient(event);

    // Get user's existing credentials to exclude from registration
    let excludeCredentials: any[] = [];
    try {
      const credResponse = await apiClient.get(
        `/api/webauthn/users/${user.id}/credentials`
      );

      if (credResponse.success && credResponse.credentials) {
        excludeCredentials = credResponse.credentials.map((cred: any) => ({
          id: cred.id,
          type: "public-key" as const,
          transports: cred.transports ? JSON.parse(cred.transports) : [],
        }));
      }
    } catch (error) {
      console.warn("Failed to get existing credentials:", error);
      // Continue without exclusions
    }

    // Generate registration options
    const options: GenerateRegistrationOptionsOpts = {
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.name || user.email,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "preferred",
        residentKey: "preferred",
      },
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
    };

    const registrationOptions = await generateRegistrationOptions(options);

    // Store challenge in database for later verification
    const challengeId = crypto.randomUUID();
    try {
      await apiClient.post("/api/webauthn/challenges", {
        id: challengeId,
        challenge: registrationOptions.challenge,
        user_id: user.id,
        challenge_type: "registration",
        expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
      });
    } catch (error) {
      console.error("Failed to store challenge:", error);
      event.json(500, {
        success: false,
        error: "Failed to store registration challenge",
      });
      return;
    }

    // Return registration options
    event.json(200, {
      success: true,
      options: {
        ...registrationOptions,
        challengeId: challengeId,
      },
    });
  } catch (error) {
    console.error("WebAuthn add passkey begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin passkey addition",
    });
  }
};
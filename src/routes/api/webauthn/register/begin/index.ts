import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateRegistrationOptions,
  type GenerateRegistrationOptionsOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_NAME = "Hamrah App";
const RP_ID = "hamrah.app";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.request.json() as { email?: string; name?: string };
    const { email, name } = body;

    if (!email || !name) {
      event.json(400, {
        success: false,
        error: "Email and name are required",
      });
      return;
    }

    const apiClient = createInternalApiClient(event);

    // Check if user exists and enforce OAuth security rule
    let userId: string;
    let excludeCredentials: any[] = [];

    try {
      const userResponse = await apiClient.get(
        `/api/users/by-email/${encodeURIComponent(email)}`
      );

      if (userResponse.success && userResponse.user) {
        // User exists - check if they require OAuth verification first
        const user = userResponse.user;
        const hasOAuthMethod = user.auth_method === 'apple' || user.auth_method === 'google';
        
        if (hasOAuthMethod) {
          // SECURITY RULE: If signing up with passkey using existing email, must authenticate with OAuth first
          event.json(400, {
            success: false,
            error: "This email is associated with an existing account. Please sign in with Apple or Google first before adding a passkey.",
          });
          return;
        }

        // Existing user without OAuth - get their credentials to exclude from registration
        userId = user.id;
        try {
          const credResponse = await apiClient.get(
            `/api/webauthn/users/${userId}/credentials`
          );

          if (credResponse.success && credResponse.credentials) {
            excludeCredentials = credResponse.credentials.map((cred: any) => ({
              id: cred.id,
              type: "public-key" as const,
              transports: cred.transports ? JSON.parse(cred.transports) : [],
            }));
          }
        } catch (error) {
          console.warn('Failed to get existing credentials:', error);
        }
      } else {
        // New user - generate temporary user ID for registration
        userId = crypto.randomUUID();
      }
    } catch {
      // If user lookup fails, treat as new user
      userId = crypto.randomUUID();
    }

    // Generate registration options
    const options: GenerateRegistrationOptionsOpts = {
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(userId),
      userName: email,
      userDisplayName: name,
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
        user_id: userId,
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

    // Return registration options in format expected by SimpleWebAuthn
    event.json(200, {
      success: true,
      options: {
        ...registrationOptions,
        challengeId: challengeId,
      },
    });
  } catch (error) {
    console.error("WebAuthn registration begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin registration",
    });
  }
};
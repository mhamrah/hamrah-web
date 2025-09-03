import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateRegistrationOptions,
  type GenerateRegistrationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_NAME = "Hamrah App";
const RP_ID = "hamrah.app";

export const onPost: RequestHandler = async ({ json, request, platform }) => {
  try {
    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return json(
        {
          success: false,
          error: "Email and name are required",
        },
        400
      );
    }

    const apiClient = createApiClient(platform);

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
          // SECURITY RULE #4: If signing up with passkey using existing email, must authenticate with OAuth first
          return json(
            {
              success: false,
              error: "This email is associated with an existing account. Please sign in with Apple or Google first before adding a passkey.",
            },
            400
          );
        }

        // Existing user without OAuth - get their credentials to exclude from registration
        userId = user.id;
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
      userID: userId,
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
    await apiClient.post("/api/webauthn/challenges", {
      id: challengeId,
      challenge: registrationOptions.challenge,
      user_id: userId,
      challenge_type: "registration",
      expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    });

    // Return registration options in format expected by iOS
    return json({
      success: true,
      options: {
        challenge: registrationOptions.challenge,
        rp: registrationOptions.rp,
        user: registrationOptions.user,
        pubKeyCredParams: registrationOptions.pubKeyCredParams,
        timeout: registrationOptions.timeout,
        excludeCredentials: registrationOptions.excludeCredentials,
        authenticatorSelection: registrationOptions.authenticatorSelection,
        attestation: registrationOptions.attestation,
        challengeId: challengeId,
      },
    });
  } catch (error) {
    console.error("WebAuthn registration begin error:", error);
    return json(
      {
        success: false,
        error: "Failed to begin registration",
      },
      500
    );
  }
};
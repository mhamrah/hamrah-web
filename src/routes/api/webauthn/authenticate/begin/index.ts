import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
} from "@simplewebauthn/server";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = await event.request.json() as { email?: string };
    const { email } = body;

    const apiClient = createInternalApiClient(event);

    let allowCredentials: any[] = [];
    let userId: string | undefined;

    // If email is provided, get user's specific credentials
    if (email) {
      try {
        const userResponse = await apiClient.get(
          `/api/users/by-email/${encodeURIComponent(email)}`
        );

        if (userResponse.success && userResponse.user) {
          userId = userResponse.user.id;
          
          // Get user's credentials
          const credentialsResponse = await apiClient.get(
            `/api/webauthn/users/${userId}/credentials`
          );

          if (credentialsResponse.success && credentialsResponse.credentials) {
            allowCredentials = credentialsResponse.credentials.map((cred: any) => ({
              id: cred.id,
              type: "public-key" as const,
              transports: cred.transports ? JSON.parse(cred.transports) : [],
            }));
          }
        }
      } catch (error) {
        console.warn('User or credentials lookup failed:', error);
        // Continue with empty allowCredentials for discoverable credentials
      }
    }

    // Generate authentication options
    const options: GenerateAuthenticationOptionsOpts = {
      timeout: 60000,
      allowCredentials, // Empty for discoverable credentials, specific for email-based
      userVerification: "preferred",
      rpID: RP_ID,
    };

    const authenticationOptions = await generateAuthenticationOptions(options);

    // Store challenge for verification
    const challengeId = crypto.randomUUID();
    try {
      await apiClient.post("/api/webauthn/challenges", {
        id: challengeId,
        challenge: authenticationOptions.challenge,
        user_id: userId || null, // null for discoverable credentials
        challenge_type: "authentication",
        expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
      });
    } catch (error) {
      console.error("Failed to store challenge:", error);
      event.json(500, {
        success: false,
        error: "Failed to store authentication challenge",
      });
      return;
    }

    // Return authentication options
    event.json(200, {
      success: true,
      options: {
        ...authenticationOptions,
        challengeId: challengeId,
      },
    });
  } catch (error) {
    console.error("WebAuthn authentication begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin authentication",
    });
  }
};
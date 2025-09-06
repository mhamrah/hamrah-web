import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const { RP_ID } = getWebAuthnConfig();
    const apiClient = createApiClient(event);

    // Generate authentication options for discoverable credentials
    // No allowCredentials list means any credential for this RP is acceptable
    const options: GenerateAuthenticationOptionsOpts = {
      timeout: 60000,
      allowCredentials: [], // Empty list allows discoverable credentials
      userVerification: "preferred",
      rpID: RP_ID,
    };

    const authenticationOptions = await generateAuthenticationOptions(options);

    // Store challenge for verification
    const challengeId = crypto.randomUUID();
    await apiClient.post("/api/webauthn/challenges", {
      id: challengeId,
      challenge: authenticationOptions.challenge,
      user_id: null, // No specific user for discoverable credentials
      challenge_type: "discoverable_authentication",
      expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    });

    // Return authentication options
    event.json(200, {
      success: true,
      options: {
        challenge: authenticationOptions.challenge,
        timeout: authenticationOptions.timeout,
        rpId: authenticationOptions.rpId,
        allowCredentials: [], // Empty for discoverable credentials
        userVerification: authenticationOptions.userVerification,
        challengeId: challengeId,
      },
    });
  } catch (error) {
    console.error("WebAuthn discoverable authentication begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin discoverable authentication",
    });
    return;
  }
};
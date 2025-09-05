import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const body = (await event.request.json()) as { email: string };
    const { email } = body;

    if (!email) {
      event.json(400, {
        success: false,
        error: "Email is required",
      });
      return;
    }

    const { RP_ID } = getWebAuthnConfig();
    const apiClient = createApiClient(event);
    const internalApiClient = createInternalApiClient(event);

    // Get user by email
    const userResponse = await internalApiClient.checkUserByEmail(email);

    if (!userResponse.success || !userResponse.user_exists || !userResponse.user) {
      event.json(404, {
        success: false,
        error: "User not found",
      });
      return;
    }

    const user = userResponse.user;

    // Get user's credentials
    const credentialsResponse = await apiClient.get(
      `/api/webauthn/users/${user.id}/credentials`,
    );

    if (
      !credentialsResponse.success ||
      !credentialsResponse.credentials ||
      credentialsResponse.credentials.length === 0
    ) {
      event.json(404, {
        success: false,
        error: "No passkeys found for user",
      });
      return;
    }

    // Convert credentials to allow list
    const allowCredentials = credentialsResponse.credentials.map(
      (cred: any) => ({
        id: cred.id,
        type: "public-key" as const,
        transports: cred.transports ? JSON.parse(cred.transports) : [],
      }),
    );

    // Generate authentication options
    const options: GenerateAuthenticationOptionsOpts = {
      timeout: 60000,
      allowCredentials,
      userVerification: "preferred",
      rpID: RP_ID,
    };

    const authenticationOptions = await generateAuthenticationOptions(options);

    // Store challenge for verification
    const challengeId = crypto.randomUUID();
    await apiClient.post("/api/webauthn/challenges", {
      id: challengeId,
      challenge: authenticationOptions.challenge,
      user_id: user.id,
      challenge_type: "authentication",
      expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    });

    // Return authentication options in format expected by iOS
    event.json(200, {
      success: true,
      options: {
        challenge: authenticationOptions.challenge,
        timeout: authenticationOptions.timeout,
        rpId: authenticationOptions.rpId,
        allowCredentials: authenticationOptions.allowCredentials,
        userVerification: authenticationOptions.userVerification,
        challengeId: challengeId,
      },
    });
  } catch (error) {
    console.error("WebAuthn authentication begin error:", error);
    event.json(500, {
      success: false,
      error: "Failed to begin authentication",
    });
    return;
  }
};

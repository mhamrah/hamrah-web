import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/internal-api-client";

// WebAuthn RP configuration
const RP_ID = "hamrah.app";

export const onPost: RequestHandler = async ({ json, request, platform }) => {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return json(
        {
          success: false,
          error: "Email is required",
        },
        400
      );
    }

    const apiClient = createApiClient(platform);

    // Get user by email
    const userResponse = await apiClient.get(
      `/api/users/by-email/${encodeURIComponent(email)}`
    );

    if (!userResponse.success || !userResponse.user) {
      return json(
        {
          success: false,
          error: "User not found",
        },
        404
      );
    }

    const user = userResponse.user;

    // Get user's credentials
    const credentialsResponse = await apiClient.get(
      `/api/webauthn/users/${user.id}/credentials`
    );

    if (
      !credentialsResponse.success ||
      !credentialsResponse.credentials ||
      credentialsResponse.credentials.length === 0
    ) {
      return json(
        {
          success: false,
          error: "No passkeys found for user",
        },
        404
      );
    }

    // Convert credentials to allow list
    const allowCredentials = credentialsResponse.credentials.map((cred: any) => ({
      id: cred.id,
      type: "public-key" as const,
      transports: cred.transports ? JSON.parse(cred.transports) : [],
    }));

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
    return json({
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
    return json(
      {
        success: false,
        error: "Failed to begin authentication",
      },
      500
    );
  }
};
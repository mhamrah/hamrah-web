import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const startTs = Date.now(); void startTs;
    let incoming: any = {};
    try {
      incoming = await event.request.clone().json(); void incoming;
    } catch {
      // ignore invalid body
    }

    const { RP_ID } = getWebAuthnConfig();
    const apiClient = createApiClient(event);

    const options: GenerateAuthenticationOptionsOpts = {
      timeout: 60000,
      allowCredentials: [],
      userVerification: "preferred",
      rpID: RP_ID,
    };

    const authenticationOptions = await generateAuthenticationOptions(options);

    const challengeId = crypto.randomUUID();
    await apiClient.post("/api/webauthn/challenges", {
      id: challengeId,
      challenge: authenticationOptions.challenge,
      user_id: null,
      challenge_type: "discoverable_authentication",
      expires_at: Date.now() + 5 * 60 * 1000,
    });

    event.json(200, {
      success: true,
      options: {
        challenge: authenticationOptions.challenge,
        timeout: authenticationOptions.timeout,
        rpId: authenticationOptions.rpId,
        allowCredentials: [],
        userVerification: authenticationOptions.userVerification,
        challengeId,
      },
    });
  } catch (error) {
    console.error("🚪 WEBAUTHN/BEGIN: ERROR during discoverable auth begin", {
      message: (error as any)?.message,
      name: (error as any)?.name,
      stack: (error as any)?.stack,
    });
    event.json(500, {
      success: false,
      error: "Failed to begin discoverable authentication",
    });
  }
};

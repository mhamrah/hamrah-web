import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateAuthenticationOptions,
  type GenerateAuthenticationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  try {
    const startTs = Date.now();
    let incoming: any = {};
    try {
      incoming = await event.request.clone().json();
    } catch {
      // no body or invalid JSON
    }
    console.log("🚪 WEBAUTHN/BEGIN: Incoming discoverable auth begin", {
      ts: startTs,
      hasBody: Object.keys(incoming || {}).length > 0,
      explicitFlag: incoming?.explicit,
      ip: event.request.headers.get("x-forwarded-for") || null,
      ua: (event.request.headers.get("user-agent") || "").slice(0, 160),
    });

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

    console.log("🚪 WEBAUTHN/BEGIN: Generating authentication options", {
      rpID: RP_ID,
      timeout: options.timeout,
      userVerification: options.userVerification,
      allowCredentialsCount: options.allowCredentials?.length || 0,
    });
    const authGenStart = Date.now();
    const authenticationOptions = await generateAuthenticationOptions(options);
    const authGenEnd = Date.now();
    console.log("🚪 WEBAUTHN/BEGIN: Generated authentication options", {
      durationMs: authGenEnd - authGenStart,
      challengeLength: authenticationOptions.challenge.length,
      rpId: authenticationOptions.rpId,
      userVerification: authenticationOptions.userVerification,
      timeout: authenticationOptions.timeout,
    });

    // Store challenge for verification
    const challengeId = crypto.randomUUID();
    const challengeStoreStart = Date.now();
    console.log("🚪 WEBAUTHN/BEGIN: Storing challenge", {
      challengeId,
      challengeLength: authenticationOptions.challenge.length,
      expiresInMs: 5 * 60 * 1000,
    });
    await apiClient.post("/api/webauthn/challenges", {
      id: challengeId,
      challenge: authenticationOptions.challenge,
      user_id: null, // No specific user for discoverable credentials
      challenge_type: "discoverable_authentication",
      expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    });
    const challengeStoreEnd = Date.now();
    console.log("🚪 WEBAUTHN/BEGIN: Challenge stored", {
      challengeId,
      storeDurationMs: challengeStoreEnd - challengeStoreStart,
    });

    // Return authentication options
    const totalEnd = Date.now();
    console.log("🚪 WEBAUTHN/BEGIN: Sending response", {
      challengeId,
      totalDurationMs: totalEnd - startTs,
      rpId: authenticationOptions.rpId,
      challengeLength: authenticationOptions.challenge.length,
    });
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
    console.error("🚪 WEBAUTHN/BEGIN: ERROR during discoverable auth begin", {
      message: (error as any)?.message,
      name: (error as any)?.name,
      stack: (error as any)?.stack,
    });
    event.json(500, {
      success: false,
      error: "Failed to begin discoverable authentication",
    });
    return;
  }
};

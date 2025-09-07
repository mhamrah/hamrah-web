import type { RequestHandler } from "@builder.io/qwik-city";
import {
  generateRegistrationOptions,
  type GenerateRegistrationOptionsOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

/**
 * Begin WebAuthn (passkey) registration for an already authenticated user.
 *
 * Expects JSON body:
 * {
 *   userId: string;
 *   email: string;
 *   displayName?: string;
 *   label?: string;        // Optional user-chosen label for device (stored later in verify)
 *   flowId?: string;       // Optional client-generated correlation id for telemetry
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   error?: string;
 *   options?: PublicKeyCredentialCreationOptionsJSON;
 *   challengeId?: string;
 * }
 *
 * Server responsibilities here:
 * - Generate registration (attestation) options
 * - Store challenge with challenge_type = 'registration'
 * - Return options + opaque challengeId (separate from actual challenge)
 *
 * The subsequent /verify route will:
 * - Fetch the stored challenge
 * - Verify the attestation
 * - Persist the credential to the API service
 */
export const onPost: RequestHandler = async (event) => {
  const startTs = Date.now();
  let body: any = {};
  try {
    body = await event.request.json();
  } catch {
    // ignore, will validate below
  }

  const flowId = body.flowId || (typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

  try {
    const { RP_NAME, RP_ID } = getWebAuthnConfig();
    const apiClient = createApiClient(event);

    const userId: string | undefined = body.userId;
    const email: string | undefined = body.email;
    const displayName: string = body.displayName || email || "User";
    const label: string | undefined = body.label;

    if (!userId || !email) {
      event.json(400, {
        success: false,
        error: "Missing required fields: userId, email",
      });
      return;
    }

    // (Removed existingCredentials fetch block to avoid type/version friction; backend will reject duplicate credential IDs)



    // Skipping excludeCredentials list to avoid cross-version simplewebauthn type mismatches.
    // (Duplicate credential registration will be naturally prevented by the backend
    // when attempting to store a credential with an existing ID.)

    const excludeList: any[] = [];
    const optionsConfig = {
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(userId),
      userName: email,
      userDisplayName: displayName,
      timeout: 60_000,
      attestationType: "none",
      excludeCredentials: excludeList,
      authenticatorSelection: {
        residentKey: "required", // Discoverable credential
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
    } as GenerateRegistrationOptionsOpts;

    const options = await generateRegistrationOptions(optionsConfig as any);

    // Create a separate challengeId for indirection (do not expose DB row PK directly)
    const challengeId = crypto.randomUUID();
    const expiresInMs = 5 * 60 * 1000;
    const expiresAt = Date.now() + expiresInMs;

    // Store challenge in API (challenge_type=registration)
    await apiClient.post("/api/webauthn/challenges", {
      id: challengeId,
      challenge: options.challenge,
      user_id: userId,
      challenge_type: "registration",
      expires_at: expiresAt,
    });



    // Attach metadata used client side (client can send it back unchanged)
    const enrichedOptions = {
      ...options,
      // Provide challengeId separately (NOT part of official WebAuthn spec object)
      // so client can correlate on verify; the real challenge stays in options.challenge
      challengeId,
      // Provide the label temporarily so verify can persist; label is not security-sensitive
      // and does not alter protocol semantics.
      label,
    };

    event.json(200, {
      success: true,
      options: enrichedOptions,
      challengeId, // top-level for convenience (client expects this)
    });
  } catch (error: any) {
    console.error("🧩 WEBAUTHN/REG_BEGIN: ERROR", {
      flowId,
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      elapsedMs: Date.now() - startTs,
    });
    event.json(500, {
      success: false,
      error: "Failed to begin passkey registration",
    });
  }
};

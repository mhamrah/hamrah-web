import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { getWebAuthnConfig } from "~/lib/webauthn/config";
import { createApiClient } from "~/lib/auth/api-client";

/**
 * Complete WebAuthn (passkey) registration.
 *
 * Request JSON:
 * {
 *   challengeId: string;
 *   response: RegistrationResponseJSON;
 *   label?: string;     // optional device label chosen by user
 *   flowId?: string;    // optional correlation id
 * }
 *
 * Response JSON (success):
 * {
 *   success: true;
 *   credentialId: string;
 * }
 *
 * Response JSON (error):
 * {
 *   success: false;
 *   error: string;
 * }
 */
export const onPost: RequestHandler = async (event) => {
  const startTs = Date.now();
  let bodyText = "";
  let body: any = {};
  try {
    bodyText = await event.request.text();
    body = JSON.parse(bodyText || "{}");
  } catch {
    body = {};
  }

  const flowId =
    body?.flowId ||
    (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2));

  const challengeId: string | undefined = body.challengeId;
  const attestationResponse = body.response;
  const label: string | undefined = body.label;

  console.log("🧩 WEBAUTHN/REG_VERIFY: Incoming request", {
    flowId,
    hasChallengeId: !!challengeId,
    hasResponse: !!attestationResponse,
    labelProvided: !!label,
    rawKeys: Object.keys(body || {}),
  });

  if (!challengeId || !attestationResponse) {
    event.json(400, {
      success: false,
      error: "Missing challengeId or response",
    });
    return;
  }

  try {
    const { RP_ID, EXPECTED_ORIGIN } = getWebAuthnConfig();
    const apiClient = createApiClient(event);

    // 1. Fetch stored challenge
    const challengeFetchStart = Date.now();
    const challengeResult = await apiClient.get(
      `/api/webauthn/challenges/${challengeId}`,
    );
    const challengeFetchEnd = Date.now();

    console.log("🧩 WEBAUTHN/REG_VERIFY: Challenge fetch result", {
      flowId,
      challengeId,
      durationMs: challengeFetchEnd - challengeFetchStart,
      success: challengeResult?.success,
      hasChallenge: !!challengeResult?.challenge,
      challengeType: challengeResult?.challenge?.challenge_type,
      userId: challengeResult?.challenge?.user_id,
    });

    if (
      !challengeResult?.success ||
      !challengeResult.challenge ||
      !challengeResult.challenge.challenge
    ) {
      event.json(404, {
        success: false,
        error: "Challenge not found",
      });
      return;
    }

    const challengeRecord = challengeResult.challenge;
    if (challengeRecord.challenge_type !== "registration") {
      event.json(400, {
        success: false,
        error: "Incorrect challenge type",
      });
      return;
    }

    const userId: string | undefined = challengeRecord.user_id;
    if (!userId) {
      event.json(400, {
        success: false,
        error: "Challenge missing associated user",
      });
      return;
    }

    // (Optional) Expiration check
    if (challengeRecord.expires_at && Date.now() > challengeRecord.expires_at) {
      event.json(400, {
        success: false,
        error: "Challenge expired",
      });
      return;
    }

    // 2. Verify attestation
    const verifyStart = Date.now();
    let verification;
    try {
      const verifyOpts: VerifyRegistrationResponseOpts = {
        response: attestationResponse,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false,
      };
      verification = await verifyRegistrationResponse(verifyOpts);
    } catch (err: any) {
      console.error("🧩 WEBAUTHN/REG_VERIFY: Verification threw", {
        flowId,
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
      });
      event.json(400, {
        success: false,
        error: err?.message || "Verification failed",
      });
      return;
    }
    const verifyEnd = Date.now();

    console.log("🧩 WEBAUTHN/REG_VERIFY: Verification result", {
      flowId,
      verified: verification?.verified,
      hasInfo: !!verification?.registrationInfo,
      durationMs: verifyEnd - verifyStart,
    });

    if (!verification?.verified || !verification.registrationInfo) {
      event.json(400, {
        success: false,
        error: "Passkey attestation could not be verified",
      });
      return;
    }

    // Normalize registrationInfo across simplewebauthn versions
    const regInfo: any = verification.registrationInfo;
    const credentialIDBuf =
      regInfo?.credentialID ||
      regInfo?.credentialIDBuffer ||
      regInfo?.credential?.id;
    const credentialPublicKeyBuf =
      regInfo?.credentialPublicKey ||
      regInfo?.credential?.publicKey ||
      regInfo?.publicKey;
    const counter =
      regInfo?.counter ??
      regInfo?.credential?.counter ??
      0;
    const aaguidRaw =
      regInfo?.aaguid ||
      regInfo?.credential?.aaguid;
    const credentialType =
      regInfo?.credentialType ||
      regInfo?.credential?.credentialType ||
      "public-key";
    const userVerified =
      !!(regInfo?.userVerified ?? regInfo?.credential?.userVerified);
    const credentialDeviceType =
      regInfo?.credentialDeviceType ||
      regInfo?.credential?.credentialDeviceType;
    const credentialBackedUp =
      !!(regInfo?.credentialBackedUp ?? regInfo?.credential?.credentialBackedUp);

    if (!credentialIDBuf || !credentialPublicKeyBuf) {
      event.json(400, {
        success: false,
        error: "Incomplete credential data",
      });
      return;
    }

    const storedCredentialId = bufferToBase64Url(credentialIDBuf);

    // (Removed redundant defensive check using old variable names credentialID / credentialPublicKey)

    // Ensure returned credential id matches response.id (after potential encoding differences)
    try {
      const responseId = attestationResponse.id;
      if (responseId && responseId !== storedCredentialId && responseId !== credentialIdToFallback(responseId)) {
        console.log("🧩 WEBAUTHN/REG_VERIFY: Credential ID mismatch (non-fatal)", {
          flowId,
          responseId,
          storedCredentialId,
        });
      }
    } catch {
      // Ignore mismatch logging failures
    }

    // 3. Persist credential in API service
    const persistStart = Date.now();
    try {
      await apiClient.post("/api/webauthn/credentials", {
        id: storedCredentialId,
        user_id: userId,
        public_key: Array.from(new Uint8Array(credentialPublicKeyBuf)),
        counter,
        transports: attestationResponse?.response?.transports || undefined,
        aaguid: aaguidRaw && aaguidRaw instanceof ArrayBuffer
          ? Array.from(new Uint8Array(aaguidRaw))
          : undefined,
        credential_type: credentialType,
        user_verified: userVerified,
        credential_device_type: credentialDeviceType,
        credential_backed_up: credentialBackedUp,
        name:
          label ||
          deriveDeviceLabel(
            event.request.headers.get("user-agent") || "",
          ),
      });
    } catch (e: any) {
      console.error("🧩 WEBAUTHN/REG_VERIFY: Persist credential failed", {
        flowId,
        message: e?.message,
      });
      event.json(500, {
        success: false,
        error: "Failed to store credential",
      });
      return;
    }
    const persistEnd = Date.now();

    // 4. Optionally delete challenge (best practice to prevent replay)
    try {
      await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
    } catch (e) {
      console.warn("🧩 WEBAUTHN/REG_VERIFY: Failed to delete challenge (non-fatal)", {
        flowId,
        challengeId,
        message: (e as any)?.message,
      });
    }

    console.log("🧩 WEBAUTHN/REG_VERIFY: SUCCESS", {
      flowId,
      userId,
      credentialId: storedCredentialId,
      verifyDurationMs: verifyEnd - verifyStart,
      persistDurationMs: persistEnd - persistStart,
      totalDurationMs: Date.now() - startTs,
    });

    event.json(200, {
      success: true,
      credentialId: storedCredentialId,
    });
  } catch (error: any) {
    console.error("🧩 WEBAUTHN/REG_VERIFY: UNHANDLED ERROR", {
      flowId,
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      elapsedMs: Date.now() - startTs,
    });
    event.json(500, {
      success: false,
      error: "Internal error verifying passkey",
    });
  }
};

/**
 * Convert ArrayBuffer to base64url string.
 */
function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Fallback attempt to normalize credential ID forms (placeholder for future heuristics).
 */
function credentialIdToFallback(id: string): string {
  // Could add additional normalizations if needed.
  return id;
}

/**
 * Derive a simple device label from the User-Agent when user doesn't provide one.
 */
function deriveDeviceLabel(userAgent: string): string {
  if (!userAgent) return "Passkey";
  if (/iPhone/i.test(userAgent)) return "iPhone Passkey";
  if (/iPad/i.test(userAgent)) return "iPad Passkey";
  if (/Android/i.test(userAgent)) return "Android Passkey";
  if (/Macintosh/i.test(userAgent)) return "Mac Passkey";
  if (/Windows/i.test(userAgent)) return "Windows Passkey";
  return "Passkey";
}

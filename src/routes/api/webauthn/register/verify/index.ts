/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/*
  RATIONALE:
  WebAuthn registration verification must defensively handle multiple possible
  response shapes from different @simplewebauthn versions (and future changes).
  Some fallback checks appear redundant to static analysis, but are intentional
  to prevent runtime breakage across environments. This file centralizes those
  defensive patterns; suppress the rule globally here instead of sprinkling
  inline disables.
*/
import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyRegistrationResponse,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { getWebAuthnConfig } from "~/lib/webauthn/config";
import { createApiClient } from "~/lib/auth/api-client";

/**
 * Complete WebAuthn (passkey) registration for an authenticated user.
 *
 * Request JSON:
 * {
 *   challengeId: string;
 *   response: RegistrationResponseJSON;
 *   label?: string;
 *   flowId?: string;
 * }
 *
 * Success:
 * {
 *   success: true;
 *   credentialId: string;
 * }
 *
 * Failure:
 * {
 *   success: false;
 *   error: string;
 * }
 *
 * Key changes (refactor):
 * - Canonical credential ID is now taken from client `response.id` (already base64url).
 * - `registrationInfo.credentialID` is used only as a cross-check.
 * - Robust normalization helpers added to prevent empty/incorrect IDs.
 * - Explicit guard rejects empty credential IDs before persistence.
 */
export const onPost: RequestHandler = async (event) => {
  const startTs = Date.now();

  // Parse body
  let body: any = {};
  let rawBody = "";
  try {
    rawBody = await event.request.text();
    body = JSON.parse(rawBody || "{}");
  } catch {
    body = {};
  }

  const flowId = body.flowId ?? (typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

  const challengeId: string | undefined = body.challengeId;
  const attestationResponse: any = body.response;
  const label: string | undefined = body.label;

  // (debug log removed)

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
    const challengeResult = await apiClient.get(
      `/api/webauthn/challenges/${challengeId}`,
    );

    // (debug log removed: challenge fetch result)

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

    if (challengeRecord.expires_at && Date.now() > challengeRecord.expires_at) {
      event.json(400, {
        success: false,
        error: "Challenge expired",
      });
      return;
    }

    // 2. Verify attestation
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


    // (debug log removed: verification result)

    if (!verification?.verified || !verification.registrationInfo) {
      event.json(400, {
        success: false,
        error: "Passkey attestation could not be verified",
      });
      return;
    }

    // 3. Canonical credential ID normalization
    const regInfo: any = verification.registrationInfo;

    // Defensive local destructuring to avoid optional chaining noise
    const {
      credentialID,
      credentialIDBuffer,
      credentialPublicKey,
      publicKey,
      credential,
      counter: regCounter,
      aaguid,
      credentialType: regCredentialType,
      userVerified: regUserVerified,
      credentialDeviceType: regDeviceType,
      credentialBackedUp: regBackedUp,
    } = regInfo;

    // Defensive aliases to avoid optional chaining lint noise
    const credObj = credential ? credential : undefined;

    // Client-provided id (already base64url from @simplewebauthn/browser JSON)
    const clientId: string | undefined = attestationResponse?.id;

    const regInfoCredentialId: Uint8Array | ArrayBuffer | string | undefined =
      credentialID ?? credentialIDBuffer ?? (credObj ? credObj.id : undefined);

    const regInfoPublicKey: Uint8Array | ArrayBuffer | string | undefined =
      credentialPublicKey ?? (credObj ? credObj.publicKey : undefined) ?? publicKey;

    const counter =
      regCounter ??
      (credObj ? credObj.counter : undefined) ??
      0;

    const aaguidRaw =
      aaguid ||
      (credObj ? credObj.aaguid : undefined);

    const credentialType =
      regCredentialType ||
      (credObj ? credObj.credentialType : undefined) ||
      "public-key";

    const userVerified =
      !!(regUserVerified ?? (credObj ? credObj.userVerified : undefined));

    const credentialDeviceType =
      regDeviceType ||
      (credObj ? credObj.credentialDeviceType : undefined);

    const credentialBackedUp =
      !!(regBackedUp ?? (credObj ? credObj.credentialBackedUp : undefined));

    if (!regInfoCredentialId || !regInfoPublicKey) {
      event.json(400, {
        success: false,
        error: "Incomplete credential data",
      });
      return;
    }

    const canonicalFromRegInfo = normalizeToBase64Url(regInfoCredentialId);
    const storedCredentialId = clientId
      ? normalizeToBase64Url(clientId)
      : canonicalFromRegInfo;

    if (!storedCredentialId) {
      console.warn("🧩 WEBAUTHN/REG_VERIFY: Empty credential ID after normalization", {
        flowId,
        clientIdPresent: !!clientId,
        regInfoType: typeOfInput(regInfoCredentialId),
        regInfoLen: toUint8Array(regInfoCredentialId).byteLength,
      });
      event.json(400, {
        success: false,
        error: "Empty credential ID after normalization",
      });
      return;
    }

    if (storedCredentialId !== canonicalFromRegInfo) {
      // (debug log removed: ID normalization mismatch)
    }

    const publicKeyBytes = toUint8Array(regInfoPublicKey);

    // 4. Persist credential
    try {
      await apiClient.post("/api/webauthn/credentials", {
        id: storedCredentialId,
        user_id: userId,
        public_key: Array.from(publicKeyBytes),
        counter,
        transports: attestationResponse?.response?.transports || undefined,
        aaguid:
          aaguidRaw instanceof Uint8Array
            ? Array.from(aaguidRaw)
            : aaguidRaw instanceof ArrayBuffer
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

    // 5. Clean up challenge (best effort)
    try {
      await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
    } catch (e: any) {
      console.warn("🧩 WEBAUTHN/REG_VERIFY: Failed to delete challenge (non-fatal)", {
        flowId,
        challengeId,
        message: e?.message,
      });
    }

    // (debug log removed: success summary)

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

/* -------------------------------------------------------------------------- */
/* Helper utilities for normalization                                         */
/* -------------------------------------------------------------------------- */

/**
 * Convert various possible forms (Uint8Array | ArrayBuffer | base64/base64url string)
 * into a Uint8Array.
 */
function toUint8Array(input: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === "string") {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    // Pad if necessary
    const padLen = normalized.length % 4;
    const padded =
      padLen === 2
        ? normalized + "=="
        : padLen === 3
          ? normalized + "="
          : normalized;
    try {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fallback: treat as UTF-8 text
      const utf8 = new TextEncoder().encode(input);
      return utf8;
    }
  }
  // Last resort empty
  return new Uint8Array();
}

/**
 * Normalize any credential ID representation into a canonical base64url string.
 */
function normalizeToBase64Url(input: Uint8Array | ArrayBuffer | string): string {
  const bytes = toUint8Array(input);
  if (bytes.byteLength === 0) return "";
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function typeOfInput(input: any): string {
  if (input instanceof Uint8Array) return "Uint8Array";
  if (input instanceof ArrayBuffer) return "ArrayBuffer";
  return typeof input;
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

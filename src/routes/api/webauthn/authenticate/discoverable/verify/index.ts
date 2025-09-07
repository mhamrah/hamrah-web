import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";

export const onPost: RequestHandler = async (event) => {
  const startTs = Date.now();
  try {
    const rawBodyText = await event.request.clone().text();
    let body: { response: any; challengeId?: string } | undefined;
    try {
      body = JSON.parse(rawBodyText || "{}");
    } catch {
      body = undefined;
    }

    console.log("✅ WEBAUTHN/VERIFY: Incoming request", {
      ts: startTs,
      rawBodyLength: rawBodyText.length,
      hasBody: !!body,
      keys: body ? Object.keys(body) : [],
      ip: event.request.headers.get("x-forwarded-for") || null,
      ua: (event.request.headers.get("user-agent") || "").slice(0, 160),
    });

    const { response: authResponse, challengeId } = (body || {}) as {
      response: any;
      challengeId?: string;
    };

    if (!authResponse) {
      console.log("✅ WEBAUTHN/VERIFY: Missing authentication response");
      event.json(400, {
        success: false,
        error: "Missing authentication response",
      });
      return;
    }

    const { RP_ID, EXPECTED_ORIGIN } = getWebAuthnConfig();
    const apiClient = createApiClient(event);
    const internalApiClient = createInternalApiClient(event);

    // Extract & normalize credential ID from the authentication response
    let credentialId: string;
    try {
      if (authResponse.rawId) {
        credentialId = Buffer.from(authResponse.rawId).toString("base64url");
      } else {
        credentialId = authResponse.id;
      }
    } catch {
      credentialId = authResponse.id;
    }

    console.log("✅ WEBAUTHN/VERIFY: Credential identification", {
      derivedCredentialId: credentialId,
      originalId: authResponse.id,
      hasRawId: !!authResponse.rawId,
      rawIdLength: authResponse.rawId?.length,
    });

    // Helper to attempt credential fetch by id
    const fetchCredential = async (id: string, phase: string) => {
      const t0 = Date.now();
      const result = await apiClient.get(`/api/webauthn/credentials/${id}`);
      const t1 = Date.now();
      console.log("✅ WEBAUTHN/VERIFY: fetchCredential result", {
        phase,
        credentialId: id,
        success: result.success,
        hasCredential: !!result.credential,
        durationMs: t1 - t0,
      });
      return result;
    };

    // Primary lookup
    let credentialResponse = await fetchCredential(credentialId, "primary");

    // Fallbacks if not found
    if (!credentialResponse.success || !credentialResponse.credential) {
      console.log("✅ WEBAUTHN/VERIFY: Primary lookup failed; attempting fallbacks");
      const fallbackIds: string[] = [];

      if (authResponse.id && authResponse.id !== credentialId) {
        fallbackIds.push(authResponse.id);
      }

      try {
        const doubleEncoded = Buffer.from(authResponse.id || credentialId).toString("base64url");
        if (!fallbackIds.includes(doubleEncoded)) {
          fallbackIds.push(doubleEncoded);
        }
      } catch {
        /* ignore */
      }

      console.log("✅ WEBAUTHN/VERIFY: Fallback candidates", { fallbackIds });

      for (const fid of fallbackIds) {
        const attempt = await fetchCredential(fid, "fallback");
        if (attempt.success && attempt.credential) {
          console.log("✅ WEBAUTHN/VERIFY: Fallback succeeded", { chosenId: fid });
          credentialId = fid;
          credentialResponse = attempt;
          break;
        }
      }
    }

    console.log("✅ WEBAUTHN/VERIFY: Final credential lookup summary", {
      finalCredentialId: credentialId,
      success: credentialResponse.success,
      hasCredential: !!credentialResponse.credential,
    });

    if (!credentialResponse.success || !credentialResponse.credential) {
      console.log("✅ WEBAUTHN/VERIFY: Credential not found after fallbacks");
      event.json(404, {
        success: false,
        error: "Credential not found",
      });
      return;
    }

    const credential = credentialResponse.credential;

    // Get the challenge
    let expectedChallenge: string;
    if (challengeId) {
      console.log("✅ WEBAUTHN/VERIFY: Fetching stored challenge", { challengeId });
      const challengeFetchStart = Date.now();
      const challengeResponse = await apiClient.get(`/api/webauthn/challenges/${challengeId}`);
      const challengeFetchEnd = Date.now();
      console.log("✅ WEBAUTHN/VERIFY: Challenge fetch result", {
        challengeId,
        success: challengeResponse.success,
        hasChallenge: !!challengeResponse.challenge,
        durationMs: challengeFetchEnd - challengeFetchStart,
      });

      if (!challengeResponse.success || !challengeResponse.challenge) {
        event.json(400, {
          success: false,
          error: "Invalid or expired challenge",
        });
        return;
      }

      const challenge = challengeResponse.challenge;

      if (challenge.expires_at < Date.now()) {
        console.log("✅ WEBAUTHN/VERIFY: Challenge expired", {
          challengeId,
          expiresAt: challenge.expires_at,
          now: Date.now(),
        });
        event.json(400, {
          success: false,
          error: "Challenge expired",
        });
        return;
      }

      expectedChallenge = challenge.challenge;
    } else {
      console.log("✅ WEBAUTHN/VERIFY: Extracting challenge from clientDataJSON");
      try {
        const clientDataJSON = JSON.parse(authResponse.response.clientDataJSON);
        expectedChallenge = clientDataJSON.challenge;
      } catch (e) {
        console.log("✅ WEBAUTHN/VERIFY: Failed to parse clientDataJSON", {
          error: (e as any)?.message,
        });
        event.json(400, {
          success: false,
          error: "Invalid client data or missing challenge",
        });
        return;
      }
    }

    console.log("✅ WEBAUTHN/VERIFY: Prepared verification payload summary", {
      expectedRPID: RP_ID,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedChallengeLength: expectedChallenge.length,
      credentialCounter: credential.counter,
      transports: credential.transports ? credential.transports : null,
    });

    const verification: VerifyAuthenticationResponseOpts = {
      response: authResponse,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64")),
        counter: credential.counter,
        transports: credential.transports ? JSON.parse(credential.transports) : [],
      },
      requireUserVerification: true,
    };

    const verifyStart = Date.now();
    const verificationResult = await verifyAuthenticationResponse(verification);
    const verifyEnd = Date.now();
    console.log("✅ WEBAUTHN/VERIFY: Verification result", {
      verified: verificationResult.verified,
      newCounter: verificationResult.authenticationInfo?.newCounter,
      userVerified: verificationResult.authenticationInfo?.userVerified,
      durationMs: verifyEnd - verifyStart,
    });

    if (!verificationResult.verified) {
      console.log("✅ WEBAUTHN/VERIFY: Verification failed");
      event.json(400, {
        success: false,
        error: "Authentication verification failed",
      });
      return;
    }

    const counterUpdateStart = Date.now();
    await apiClient.patch(`/api/webauthn/credentials/${credential.id}/counter`, {
      counter: verificationResult.authenticationInfo.newCounter,
      last_used: Date.now(),
    });
    const counterUpdateEnd = Date.now();
    console.log("✅ WEBAUTHN/VERIFY: Counter updated", {
      credentialId: credential.id,
      newCounter: verificationResult.authenticationInfo.newCounter,
      durationMs: counterUpdateEnd - counterUpdateStart,
    });

    const userFetchStart = Date.now();
    const userResponse = await internalApiClient.get(`/api/internal/users/${credential.user_id}`);
    const userFetchEnd = Date.now();
    console.log("✅ WEBAUTHN/VERIFY: User fetch result", {
      userId: credential.user_id,
      success: !!userResponse?.user,
      durationMs: userFetchEnd - userFetchStart,
    });

    if (!userResponse || !userResponse.user) {
      event.json(500, {
        success: false,
        error: "User not found after authentication",
      });
      return;
    }

    const sessionStart = Date.now();
    const sessionResponse = await internalApiClient.createSession({
      user_id: userResponse.user.id,
      platform: "web",
    });
    const sessionEnd = Date.now();
    console.log("✅ WEBAUTHN/VERIFY: Session creation result", {
      success: sessionResponse.success,
      tokenPresent: !!sessionResponse.access_token,
      durationMs: sessionEnd - sessionStart,
    });

    if (!sessionResponse.success || !sessionResponse.access_token) {
      event.json(500, {
        success: false,
        error: "Failed to create session",
      });
      return;
    }

    if (challengeId) {
      const cleanupStart = Date.now();
      await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
      const cleanupEnd = Date.now();
      console.log("✅ WEBAUTHN/VERIFY: Challenge cleanup", {
        challengeId,
        durationMs: cleanupEnd - cleanupStart,
      });
    }

    const endTs = Date.now();
    console.log("✅ WEBAUTHN/VERIFY: SUCCESS", {
      totalDurationMs: endTs - startTs,
      userId: userResponse.user.id,
      credentialId,
    });

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: userResponse.user,
      session_token: sessionResponse.access_token,
    });
  } catch (error) {
    const endTs = Date.now();
    console.error("✅ WEBAUTHN/VERIFY: ERROR", {
      totalDurationMs: endTs - startTs,
      name: (error as any)?.name,
      message: (error as any)?.message,
      stack: (error as any)?.stack,
    });
    event.json(500, {
      success: false,
      error: "Failed to complete authentication",
    });
    return;
  }
};

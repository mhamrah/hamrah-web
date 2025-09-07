import type { RequestHandler } from "@builder.io/qwik-city";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { createApiClient } from "~/lib/auth/api-client";
import { createInternalApiClient } from "~/lib/auth/internal-api-client";
import { getWebAuthnConfig } from "~/lib/webauthn/config";
import { setSessionTokenCookie } from "~/lib/auth/session";

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

    const { response: authResponse, challengeId } = (body || {}) as {
      response: any;
      challengeId?: string;
    };

    if (!authResponse) {
      event.json(400, {
        success: false,
        error: "Missing authentication response",
      });
      return;
    }

    const { RP_ID, EXPECTED_ORIGIN } = getWebAuthnConfig();
    const apiClient = createApiClient(event);
    let internalApiClient: any = null;

    const credentialId: string | undefined = authResponse.id;
    if (!credentialId) {
      event.json(400, { success: false, error: "Missing credential id" });
      return;
    }

    const fetchCredential = async (id: string) => {
      return apiClient.get(`/api/webauthn/credentials/${id}`);
    };

    const credentialResponse = await fetchCredential(credentialId);

    if (!credentialResponse.success || !credentialResponse.credential) {
      event.json(404, { success: false, error: "Credential not found" });
      return;
    }

    const credential = credentialResponse.credential;

    let expectedChallenge: string;
    if (challengeId) {
      const challengeResponse = await apiClient.get(`/api/webauthn/challenges/${challengeId}`);
      if (!challengeResponse.success || !challengeResponse.challenge) {
        event.json(400, {
          success: false,
          error: "Invalid or expired challenge",
        });
        return;
      }
      const challenge = challengeResponse.challenge;
      if (challenge.expires_at < Date.now()) {
        event.json(400, {
          success: false,
          error: "Challenge expired",
        });
        return;
      }
      expectedChallenge = challenge.challenge;
    } else {
      try {
        const clientDataJSON = JSON.parse(authResponse.response.clientDataJSON);
        expectedChallenge = clientDataJSON.challenge;
      } catch {
        event.json(400, {
          success: false,
          error: "Invalid client data or missing challenge",
        });
        return;
      }
    }

    const verification: VerifyAuthenticationResponseOpts = {
      response: authResponse,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64")),
        counter: credential.counter,
        transports: credential.transports || undefined,
      },
      requireUserVerification: true,
    };

    const verificationResult = await verifyAuthenticationResponse(verification);

    if (!verificationResult.verified) {
      event.json(400, {
        success: false,
        error: "Authentication verification failed",
      });
      return;
    }

    await apiClient.patch(`/api/webauthn/credentials/${credential.id}/counter`, {
      counter: verificationResult.authenticationInfo.newCounter,
      last_used: Date.now(),
    });

    try {
      internalApiClient = createInternalApiClient(event);
    } catch {
      event.json(200, {
        success: false,
        error: "Internal service unavailable",
      });
      return;
    }

    const sessionResponse = await internalApiClient.createSession({
      user_id: credential.user_id,
      platform: "web",
    });

    if (!sessionResponse.success || !sessionResponse.access_token || !sessionResponse.user) {
      event.json(500, {
        success: false,
        error: "Failed to create session",
      });
      return;
    }

    if (challengeId) {
      try {
        await apiClient.delete(`/api/webauthn/challenges/${challengeId}`);
      } catch {
        // silently ignore cleanup errors
      }
    }

    // Set persistent session cookie (30 days) so the user stays logged in after passkey auth
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    setSessionTokenCookie(event, sessionResponse.access_token, expiresAt);

    event.json(200, {
      success: true,
      message: "Authentication successful",
      user: sessionResponse.user,
      session_token: sessionResponse.access_token,
    });
  } catch (error) {
    const endTs = Date.now();
    console.error("WEBAUTHN_VERIFY_ERROR", {
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

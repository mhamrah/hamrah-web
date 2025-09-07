import type { RequestHandler } from "@builder.io/qwik-city";
import { createApiClient } from "~/lib/auth/api-client";
import type { WebAuthnCredential } from "~/lib/auth/webauthn";

/**
 * GET /api/webauthn/users/:userId/credentials
 *
 * Proxies to the backend API service to list a user's registered passkeys (WebAuthn credentials).
 *
 * Successful response shape expected by the frontend WebAuthn client:
 * {
 *   success: true;
 *   credentials: WebAuthnCredential[];
 * }
 *
 * Error response shape:
 * {
 *   success: false;
 *   error: string;
 * }
 */
export const onGet: RequestHandler = async (event) => {
  const userId = event.params.userId;

  if (!userId) {
    event.json(400, {
      success: false,
      error: "Missing userId",
    });
    return;
  }

  const apiClient = createApiClient(event);

  try {
    const start = Date.now();
    const apiResponse: any = await apiClient.get(
      `/api/webauthn/users/${encodeURIComponent(userId)}/credentials`,
    );

    // Normalize response
    const credentials: WebAuthnCredential[] = Array.isArray(apiResponse?.credentials)
      ? apiResponse.credentials
      : [];

    event.json(200, {
      success: true,
      credentials,
      count: credentials.length,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    // Swallow internal error details; expose a generic message
    event.json(500, {
      success: false,
      error: err?.message || "Failed to fetch user passkeys",
    });
  }
};

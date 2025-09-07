import type { RequestHandler } from "@builder.io/qwik-city";
import { createApiClient } from "~/lib/auth/api-client";

/**
 * DELETE /api/webauthn/credentials/:credentialId
 *
 * Deletes (revokes) a stored WebAuthn credential (passkey) for the authenticated user.
 *
 * This route proxies the request to the backend API service and normalizes the response
 * shape expected by the frontend `webauthnClient.deletePasskey()` method.
 *
 * Successful JSON response:
 * {
 *   "success": true
 * }
 *
 * Error JSON response:
 * {
 *   "success": false,
 *   "error": "Reason..."
 * }
 *
 * Security expectations:
 * - The backend API enforces authorization (session cookie / ownership of credential).
 * - We keep responses intentionally generic to avoid leaking existence of credential IDs.
 */
export const onDelete: RequestHandler = async (event) => {
  const credentialId = event.params.credentialId;

  if (!credentialId) {
    event.json(400, {
      success: false,
      error: "Missing credentialId",
    });
    return;
  }

  const apiClient = createApiClient(event);
  const start = Date.now();

  try {
    await apiClient.delete(
      `/api/webauthn/credentials/${encodeURIComponent(credentialId)}`
    );

    // Success (do not echo sensitive details)
    event.json(200, {
      success: true,
      credentialId, // included only for client correlation/debug; remove if sensitive
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    const message =
      err?.message && typeof err.message === "string"
        ? sanitizeError(err.message)
        : "Failed to delete passkey";

    // Avoid distinguishing between "not found" and "not authorized"
    event.json(500, {
      success: false,
      error: message,
    });
  }
};

/**
 * Lightly sanitize error messages to avoid leaking backend internals.
 */
function sanitizeError(msg: string): string {
  // Strip common internal prefixes or stack fragments
  return msg
    .replace(/API error:\s*/i, "")
    .replace(/internal server error/i, "server error")
    .trim();
}

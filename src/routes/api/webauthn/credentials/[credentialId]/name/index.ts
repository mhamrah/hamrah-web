import type { RequestHandler } from "@builder.io/qwik-city";
import { createApiClient } from "~/lib/auth/api-client";

/**
 * PATCH /api/webauthn/credentials/:credentialId/name
 *
 * Renames a stored WebAuthn credential (passkey).
 *
 * Request JSON:
 * {
 *   "name": "My MacBook Pro"
 * }
 *
 * Success Response:
 * {
 *   "success": true,
 *   "credentialId": "xxxx",
 *   "name": "My MacBook Pro"
 * }
 *
 * Error Response:
 * {
 *   "success": false,
 *   "error": "Reason"
 * }
 *
 * Notes:
 * - We proxy to the backend API (which performs auth & ownership checks).
 * - We keep responses generic to avoid leaking sensitive info.
 */
export const onPatch: RequestHandler = async (event) => {
  const credentialId = event.params.credentialId;

  if (!credentialId) {
    event.json(400, {
      success: false,
      error: "Missing credentialId",
    });
    return;
  }

  let body: any = {};
  try {
    body = await event.request.json();
  } catch {
    // ignored; validated below
  }

  const rawName = typeof body?.name === "string" ? body.name : "";
  const name = rawName.trim();

  if (!name) {
    event.json(400, {
      success: false,
      error: "Missing name",
    });
    return;
  }

  if (name.length > 64) {
    event.json(400, {
      success: false,
      error: "Name too long (max 64 chars)",
    });
    return;
  }

  const apiClient = createApiClient(event);
  const start = Date.now();

  try {
    await apiClient.patch(
      `/api/webauthn/credentials/${encodeURIComponent(credentialId)}/name`,
      { name }
    );

    event.json(200, {
      success: true,
      credentialId,
      name,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    const message =
      typeof err?.message === "string"
        ? sanitizeError(err.message)
        : "Failed to rename passkey";

    event.json(500, {
      success: false,
      error: message,
    });
  }
};

/**
 * Lightly sanitize backend / fetch layer errors so we don't leak internals.
 */
function sanitizeError(msg: string): string {
  return msg
    .replace(/API error:\s*/i, "")
    .replace(/internal server error/i, "server error")
    .trim();
}

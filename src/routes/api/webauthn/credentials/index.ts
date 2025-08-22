import type { RequestHandler } from "@builder.io/qwik-city";
import { authenticateRequest } from "~/middleware/auth";
import {
  getUserWebAuthnCredentials,
  deleteWebAuthnCredential,
  updateWebAuthnCredentialName,
} from "~/lib/auth/webauthn";

// GET: List user's WebAuthn credentials
export const onGet: RequestHandler = async (event) => {
  try {
    const authResult = await authenticateRequest(event);

    if (!authResult) {
      event.json(401, {
        success: false,
        error: "Not authenticated",
      });
      return;
    }

    const { user } = authResult;

    const credentials = await getUserWebAuthnCredentials(event, user.id);

    // Return safe credential info (don't expose sensitive data)
    const safeCredentials = credentials.map((cred) => ({
      id: cred.id,
      name: cred.name || "Unnamed Passkey",
      createdAt: cred.createdAt,
      lastUsed: cred.lastUsed,
      credentialDeviceType: cred.credentialDeviceType,
      credentialBackedUp: cred.credentialBackedUp,
    }));

    event.json(200, {
      success: true,
      credentials: safeCredentials,
    });
  } catch (error) {
    console.error("Get credentials error:", error);
    event.json(500, {
      success: false,
      error: "Failed to get credentials",
    });
  }
};

// DELETE: Remove a WebAuthn credential
export const onDelete: RequestHandler = async (event) => {
  try {
    const authResult = await authenticateRequest(event);

    if (!authResult) {
      event.json(401, {
        success: false,
        error: "Not authenticated",
      });
      return;
    }

    const { user } = authResult;

    const body = await event.parseBody();
    const { credentialId } = body as { credentialId: string };

    if (!credentialId) {
      event.json(400, {
        success: false,
        error: "Credential ID required",
      });
      return;
    }

    const deleted = await deleteWebAuthnCredential(
      event,
      credentialId,
      user.id,
    );

    if (!deleted) {
      event.json(404, {
        success: false,
        error: "Credential not found",
      });
      return;
    }

    event.json(200, {
      success: true,
      message: "Credential deleted successfully",
    });
  } catch (error) {
    console.error("Delete credential error:", error);
    event.json(500, {
      success: false,
      error: "Failed to delete credential",
    });
  }
};

// PATCH: Update credential name
export const onPatch: RequestHandler = async (event) => {
  try {
    const authResult = await authenticateRequest(event);

    if (!authResult) {
      event.json(401, {
        success: false,
        error: "Not authenticated",
      });
      return;
    }

    const { user } = authResult;

    const body = await event.parseBody();
    const { credentialId, name } = body as {
      credentialId: string;
      name: string;
    };

    if (!credentialId || !name) {
      event.json(400, {
        success: false,
        error: "Credential ID and name required",
      });
      return;
    }

    const updated = await updateWebAuthnCredentialName(
      event,
      credentialId,
      user.id,
      name,
    );

    if (!updated) {
      event.json(404, {
        success: false,
        error: "Credential not found",
      });
      return;
    }

    event.json(200, {
      success: true,
      message: "Credential name updated successfully",
    });
  } catch (error) {
    console.error("Update credential error:", error);
    event.json(500, {
      success: false,
      error: "Failed to update credential",
    });
  }
};

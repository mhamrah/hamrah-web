// WebAuthn client implementation using @simplewebauthn/browser
// Handles passkey registration and authentication flows

import { startAuthentication } from '@simplewebauthn/browser';
import { createApiClient } from './api-client';

// Types for our WebAuthn implementation
// (Removed PasskeyRegistrationRequest - email/registration flow deprecated)

// (Removed PasskeyAuthenticationRequest - email-scoped auth deprecated)

export interface WebAuthnCredential {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports?: string[];
  name?: string;
  created_at: number;
}

// (Removed PasskeyRegistrationResult - registration flow deprecated)

export interface PasskeyAuthenticationResult {
  success: boolean;
  user?: any;
  session_token?: string;
  error?: string;
}

// WebAuthn Client
export class WebAuthnClient {
  private apiClient = createApiClient();

  // Check if WebAuthn is supported in the browser
  static isSupported(): boolean {
    return !!(
      window?.PublicKeyCredential &&
      window?.navigator?.credentials &&
      typeof window.navigator.credentials.create === 'function' &&
      typeof window.navigator.credentials.get === 'function'
    );
  }

  // (Removed: conditional mediation detection deprecated)





  // NOTE: User existence checking has been removed for security reasons.
  // The auth flow now attempts both register and authenticate without revealing user existence.

  // (Removed registerPasskey - registration flow deprecated)

  // (Removed: authenticateWithConditionalUI deprecated in favor of explicit discoverable flow)

  // (Removed authenticateWithPasskey - email-scoped auth deprecated)

  // (Removed addPasskey - multi-passkey management deprecated in this phase)

  // Get user's passkeys
  async getUserPasskeys(userId: string): Promise<WebAuthnCredential[]> {
    try {
      const response = await this.apiClient.get(`/api/webauthn/users/${userId}/credentials`);
      return response.success ? response.credentials : [];
    } catch {
      return [];
    }
  }

  // Delete a passkey
  async deletePasskey(credentialId: string): Promise<boolean> {
    try {
      const response = await this.apiClient.delete(`/api/webauthn/credentials/${credentialId}`);
      return response.success;
    } catch {
      return false;
    }
  }

  // Rename a passkey
  async renamePasskey(credentialId: string, name: string): Promise<boolean> {
    try {
      const response = await this.apiClient.patch(`/api/webauthn/credentials/${credentialId}/name`, {
        name,
      });
      return response.success;
    } catch {
      return false;
    }
  }
}

// Export a default instance
export const webauthnClient = new WebAuthnClient();

/**
 * Explicit discoverable (non-conditional UI) passkey authentication flow.
 * This bypasses conditional mediation/autofill and directly invokes a discoverable credentials get()
 * to force the platform authenticator prompt (Touch ID / Face ID / system passkey sheet).
 *
 * Use this when:
 * - Conditional UI silently does nothing (common on some Safari builds)
 * - You want an explicit user-initiated button flow
 */
export async function authenticateWithDiscoverablePasskey(): Promise<PasskeyAuthenticationResult> {
  // Basic support check (mirrors class method style)
  if (
    !(
      (globalThis as any)?.PublicKeyCredential &&
      (globalThis as any)?.navigator?.credentials &&
      typeof (navigator as any).credentials.get === 'function'
    )
  ) {
    return {
      success: false,
      error: 'WebAuthn is not supported in this browser',
    };
  }

  try {
    const flowId = (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const startTs = Date.now();
    console.log('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_START', {
      flowId,
      startTs,
      mode: 'discoverable-explicit',
      phase: 'begin-request',
    });

    const beginFetchStart = Date.now();
    const beginResponse: any = await fetch('/api/webauthn/authenticate/discoverable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ explicit: true, flowId, ts: beginFetchStart }),
    }).then(async (res) => {
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { parseError: true, raw: text }; }
      return json;
    });
    const beginFetchEnd = Date.now();

    if (!beginResponse.success || !beginResponse.options) {
      console.error('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_ERROR begin-response-invalid', {
        flowId,
        durationMs: beginFetchEnd - beginFetchStart,
        beginResponse,
      });
      const authEnd = Date.now();
      return {
        success: false,
        error: beginResponse.error || 'Failed to begin authentication',
      };
    }

    console.log('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_PHASE begin-response', {
      flowId,
      durationMs: beginFetchEnd - beginFetchStart,
      rpId: beginResponse.options?.rpId,
      challengeId: beginResponse.options?.challengeId,
      challengeLength: beginResponse.options?.challenge?.length,
      userVerification: beginResponse.options?.userVerification,
      allowCredentialsCount: beginResponse.options?.allowCredentials?.length || 0,
      rawKeys: Object.keys(beginResponse.options || {}),
    });

    console.log('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_PHASE invoking-authenticator', {
      flowId,
      phase: 'authenticator-get',
    });

    console.log('🔐 (Discoverable) Got challenge, invoking authenticator...'); // retained legacy log
    console.log('🔐 (Discoverable) Options:', beginResponse.options); // retained

    // 2. Invoke authenticator WITHOUT conditional/autofill mode
    const authStart = Date.now();
    const authResponse = await startAuthentication({
      optionsJSON: beginResponse.options,
      // Explicitly disable browser autofill/conditional to force prompt
      useBrowserAutofill: false,
    });
    const authEnd = Date.now();

    console.log('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_PHASE authenticator-response', {
      flowId,
      durationMs: authEnd - authStart,
      credentialId: authResponse?.id,
      hasRawId: !!authResponse?.rawId,
      rawIdLength: authResponse?.rawId?.length,
      clientDataJSONLength: authResponse?.response?.clientDataJSON?.length,
      authenticatorDataLength: authResponse?.response?.authenticatorData?.length,
      signatureLength: authResponse?.response?.signature?.length,
      userHandlePresent: !!authResponse?.response?.userHandle,
      type: authResponse?.type,
    });
    console.log('🔐 (Discoverable) Authentication response:', authResponse); // legacy

    if (!authResponse) {
      return {
        success: false,
        error: 'No passkey selected',
      };
    }

    const verifySendStart = Date.now();
    console.log('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_PHASE sending-assertion', {
      flowId,
      challengeId: beginResponse.options.challengeId,
      credentialId: authResponse.id,
      phase: 'verify-request',
    });
    console.log('🔐 (Discoverable) Sending assertion to backend...'); // legacy

    // 3. Send to backend for verification (reuse conditional endpoint logic)
    const completeResponse: any = await fetch('/api/webauthn/authenticate/discoverable/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        challengeId: beginResponse.options.challengeId,
        response: authResponse,
        mode: 'discoverable-explicit',
      }),
    }).then(async (res) => {
      const txt = await res.text();
      let parsed;
      try { parsed = JSON.parse(txt); } catch { parsed = { parseError: true, raw: txt }; }
      return parsed;
    });
    const verifySendEnd = Date.now();

    console.log('🧩 WEBAUTHN/CLIENT: AUTH_FLOW_PHASE verify-response', {
      flowId,
      durationMs: verifySendEnd - verifySendStart,
      overallDurationMs: verifySendEnd - startTs,
      success: completeResponse?.success,
      hasUser: !!completeResponse?.user,
      sessionTokenPresent: !!completeResponse?.session_token,
      error: completeResponse?.error,
      keys: completeResponse ? Object.keys(completeResponse) : [],
    });
    console.log('🔐 (Discoverable) Backend verification response:', completeResponse); // legacy

    if (!completeResponse.success) {
      return {
        success: false,
        error: completeResponse.error || 'Authentication failed',
      };
    }

    return {
      success: true,
      user: completeResponse.user,
      session_token: completeResponse.session_token,
    };
  } catch (error: any) {
    console.error('🔐 (Discoverable) Authentication error:', error);

    let errorMessage = 'Authentication failed';
    if (error?.name === 'NotAllowedError') {
      errorMessage = 'Authentication was cancelled or not allowed';
    } else if (error?.name === 'AbortError') {
      errorMessage = 'Authentication was aborted';
    } else if (error?.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

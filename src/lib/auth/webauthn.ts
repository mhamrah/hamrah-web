// WebAuthn client implementation using @simplewebauthn/browser
// Handles passkey registration and authentication flows (registration + explicit discoverable auth)

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { createApiClient } from './api-client';

export interface WebAuthnCredential {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports?: string[];
  name?: string;
  created_at: number;
}

export interface PasskeyAuthenticationResult {
  success: boolean;
  user?: any;
  session_token?: string;
  error?: string;
}

export class WebAuthnClient {
  private apiClient = createApiClient();

  static isSupported(): boolean {
    return !!(
      window?.PublicKeyCredential &&
      window?.navigator?.credentials &&
      typeof window.navigator.credentials.create === 'function' &&
      typeof window.navigator.credentials.get === 'function'
    );
  }

  async getUserPasskeys(userId: string): Promise<WebAuthnCredential[]> {
    try {
      const response = await this.apiClient.get(`/api/webauthn/users/${userId}/credentials`);
      return response.success ? response.credentials : [];
    } catch {
      return [];
    }
  }

  async deletePasskey(credentialId: string): Promise<boolean> {
    try {
      const response = await this.apiClient.delete(`/api/webauthn/credentials/${credentialId}`);
      return response.success;
    } catch {
      return false;
    }
  }

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

  async addPasskey(
    user: { id: string; email: string; name?: string },
    opts?: { name?: string }
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    if (!WebAuthnClient.isSupported()) {
      return { success: false, error: 'WebAuthn is not supported in this browser' };
    }

    const label = opts?.name;
    try {
      const flowId = (globalThis as any).crypto?.randomUUID
        ? (globalThis as any).crypto.randomUUID()
        : Math.random().toString(36).slice(2);

      const beginResponse: any = await fetch('/api/webauthn/register/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          displayName: user.name || user.email,
          label,
          flowId,
        }),
      }).then(async (r) => {
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch {
          return { success: false, error: 'Invalid JSON begin' };
        }
      });

      if (!beginResponse.success || !beginResponse.options) {
        return { success: false, error: beginResponse.error || 'Failed to begin passkey registration' };
      }

      const registrationResponse = await startRegistration({
        optionsJSON: beginResponse.options,
      });

      if (!registrationResponse) {
        return { success: false, error: 'No credential created' };
      }

      const verifyResponse: any = await fetch('/api/webauthn/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challengeId: beginResponse.challengeId,
          response: registrationResponse,
          label,
          flowId,
        }),
      }).then(async (r) => {
        const txt = await r.text();
        try {
          return JSON.parse(txt);
        } catch {
          return { success: false, error: 'Invalid JSON verify' };
        }
      });

      if (!verifyResponse.success) {
        return { success: false, error: verifyResponse.error || 'Passkey registration failed' };
      }

      return {
        success: true,
        credentialId: verifyResponse.credentialId,
      };
    } catch (e: any) {
      let msg = 'Passkey registration failed';
      if (e?.name === 'NotAllowedError') msg = 'Registration was cancelled or timed out';
      else if (e?.message) msg = e.message;
      return { success: false, error: msg };
    }
  }
}

export const webauthnClient = new WebAuthnClient();

export async function authenticateWithDiscoverablePasskey(): Promise<PasskeyAuthenticationResult> {
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

    const beginResponse: any = await fetch('/api/webauthn/authenticate/discoverable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ explicit: true, flowId }),
    }).then(async (res) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, error: 'Invalid begin response' };
      }
    });

    if (!beginResponse.success || !beginResponse.options) {
      return {
        success: false,
        error: beginResponse.error || 'Failed to begin authentication',
      };
    }

    const authResponse = await startAuthentication({
      optionsJSON: beginResponse.options,
      useBrowserAutofill: false,
    });

    if (!authResponse) {
      return { success: false, error: 'No passkey selected' };
    }

    const completeResponse: any = await fetch('/api/webauthn/authenticate/discoverable/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        challengeId: beginResponse.options.challengeId,
        response: authResponse,
        mode: 'discoverable-explicit',
      }),
    }).then(async (res) => {
      const txt = await res.text();
      try {
        return JSON.parse(txt);
      } catch {
        return { success: false, error: 'Invalid verify response' };
      }
    });

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
    let errorMessage = 'Authentication failed';
    if (error?.name === 'NotAllowedError') errorMessage = 'Authentication was cancelled or not allowed';
    else if (error?.name === 'AbortError') errorMessage = 'Authentication was aborted';
    else if (error?.message) errorMessage = error.message;

    return {
      success: false,
      error: errorMessage,
    };
  }
}

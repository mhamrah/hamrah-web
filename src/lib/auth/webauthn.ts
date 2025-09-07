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
    console.log('🔐 (Discoverable) Starting explicit passkey authentication...');

    // 1. Request discoverable challenge (server returns options without allowCredentials)
    const beginResponse: any = await fetch('/api/webauthn/authenticate/discoverable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ explicit: true }),
    }).then((res) => res.json());

    if (!beginResponse.success || !beginResponse.options) {
      console.error('🔐 (Discoverable) Failed to get challenge:', beginResponse);
      return {
        success: false,
        error: beginResponse.error || 'Failed to begin authentication',
      };
    }

    console.log('🔐 (Discoverable) Got challenge, invoking authenticator...');
    console.log('🔐 (Discoverable) Options:', beginResponse.options);

    // 2. Invoke authenticator WITHOUT conditional/autofill mode
    const authResponse = await startAuthentication({
      optionsJSON: beginResponse.options,
      // Explicitly disable browser autofill/conditional to force prompt
      useBrowserAutofill: false,
    });

    console.log('🔐 (Discoverable) Authentication response:', authResponse);

    if (!authResponse) {
      return {
        success: false,
        error: 'No passkey selected',
      };
    }

    console.log('🔐 (Discoverable) Sending assertion to backend...');

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
    }).then((res) => res.json());

    console.log('🔐 (Discoverable) Backend verification response:', completeResponse);

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

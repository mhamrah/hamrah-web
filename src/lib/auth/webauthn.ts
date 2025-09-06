// WebAuthn client implementation using @simplewebauthn/browser
// Handles passkey registration and authentication flows

import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { createApiClient } from './api-client';

// Types for our WebAuthn implementation
export interface PasskeyRegistrationRequest {
  email: string;
  name: string;
}

export interface PasskeyAuthenticationRequest {
  email: string;
}

export interface WebAuthnCredential {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports?: string[];
  name?: string;
  created_at: number;
}

export interface PasskeyRegistrationResult {
  success: boolean;
  error?: string;
}

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

  // NOTE: User existence checking has been removed for security reasons.
  // The auth flow now attempts both register and authenticate without revealing user existence.

  // Register a new passkey (can be first passkey for new user or additional passkey)
  async registerPasskey(request: PasskeyRegistrationRequest): Promise<PasskeyRegistrationResult> {
    if (!WebAuthnClient.isSupported()) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    try {
      // Step 1: Begin registration - get challenge and options  
      const beginResponse: any = await fetch('/api/webauthn/register/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: request.email,
          name: request.name,
        }),
      }).then(res => res.json());

      if (!beginResponse.success || !beginResponse.options) {
        return {
          success: false,
          error: beginResponse.error || 'Failed to begin registration',
        };
      }

      // Step 2: Start registration with the browser
      const registrationResponse = await startRegistration({ optionsJSON: beginResponse.options });

      // Step 3: Complete registration - verify the response
      const completeResponse: any = await fetch('/api/webauthn/register/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          challengeId: beginResponse.options.challengeId,
          response: registrationResponse,
          email: request.email,
          name: request.name,
        }),
      }).then(res => res.json());

      if (!completeResponse.success) {
        return {
          success: false,
          error: completeResponse.error || 'Failed to complete registration',
        };
      }

      return { success: true };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Registration failed',
      };
    }
  }

  // Authenticate with passkey
  async authenticateWithPasskey(request: PasskeyAuthenticationRequest): Promise<PasskeyAuthenticationResult> {
    if (!WebAuthnClient.isSupported()) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    try {
      // Step 1: Begin authentication - get challenge and options
      const beginResponse: any = await fetch('/api/webauthn/authenticate/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: request.email,
        }),
      }).then(res => res.json());

      if (!beginResponse.success || !beginResponse.options) {
        return {
          success: false,
          error: beginResponse.error || 'Failed to begin authentication',
        };
      }

      // Step 2: Start authentication with the browser
      const authResponse = await startAuthentication({ optionsJSON: beginResponse.options });

      // Step 3: Complete authentication - verify the response
      const completeResponse: any = await fetch('/api/webauthn/authenticate/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          challengeId: beginResponse.options.challengeId,
          response: authResponse,
          email: request.email,
        }),
      }).then(res => res.json());

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
      return {
        success: false,
        error: error.message || 'Authentication failed',
      };
    }
  }

  // Add an additional passkey to existing user (authenticated flow)
  async addPasskey(): Promise<PasskeyRegistrationResult> {
    if (!WebAuthnClient.isSupported()) {
      return {
        success: false,
        error: 'WebAuthn is not supported in this browser',
      };
    }

    try {
      // Step 1: Begin add passkey - get challenge and options
      const beginResponse: any = await fetch('/api/webauthn/add-passkey/begin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      }).then(res => res.json());

      if (!beginResponse.success || !beginResponse.options) {
        return {
          success: false,
          error: beginResponse.error || 'Failed to begin passkey addition',
        };
      }

      // Step 2: Start registration with the browser
      const registrationResponse = await startRegistration({ optionsJSON: beginResponse.options });

      // Step 3: Complete add passkey - verify the response
      const completeResponse: any = await fetch('/api/webauthn/add-passkey/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          challengeId: beginResponse.options.challengeId,
          response: registrationResponse,
        }),
      }).then(res => res.json());

      if (!completeResponse.success) {
        return {
          success: false,
          error: completeResponse.error || 'Failed to add passkey',
        };
      }

      return { success: true };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to add passkey',
      };
    }
  }

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
// WebAuthn client implementation with conditional UI and client-side detection
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { createApiClient } from './api-client';

export interface WebAuthnCredential {
  id: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
}

export interface PasskeyRegistrationResult {
  success: boolean;
  user?: any;
  message?: string;
  error?: string;
  requiresOAuth?: boolean;
}

export interface PasskeyAuthenticationResult {
  success: boolean;
  user?: any;
  sessionToken?: string;
  message?: string;
  error?: string;
}

export class WebAuthnClient {
  private apiClient: ReturnType<typeof createApiClient>;

  constructor() {
    this.apiClient = createApiClient();
  }

  // Browser capability detection
  async isWebAuthnSupported(): Promise<boolean> {
    return browserSupportsWebAuthn();
  }

  async isConditionalUISupported(): Promise<boolean> {
    try {
      return await browserSupportsWebAuthnAutofill();
    } catch (error) {
      console.warn('Error checking conditional UI support:', error);
      return false;
    }
  }

  async isPlatformAuthenticatorAvailable(): Promise<boolean> {
    try {
      return await platformAuthenticatorIsAvailable();
    } catch (error) {
      console.warn('Error checking platform authenticator:', error);
      return false;
    }
  }

  // Client-side passkey detection
  async hasPasskeysForDomain(): Promise<boolean> {
    if (!await this.isWebAuthnSupported()) {
      return false;
    }

    try {
      // Attempt to get credentials without specific allowCredentials
      // This will only work if there are passkeys for this domain
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [], // Empty array means any credential for this domain
          userVerification: 'preferred',
          timeout: 5000,
        },
        mediation: 'conditional', // Use conditional UI
      });

      return !!credential;
    } catch (error) {
      // No passkeys available or user cancelled
      return false;
    }
  }

  // Check if user has passkeys for a specific email
  async hasPasskeysForUser(email: string): Promise<boolean> {
    try {
      // Attempt authentication to see if user has passkeys
      const beginResponse = await this.apiClient.post('/api/webauthn/authenticate/begin', {
        email,
      });
      
      if (!beginResponse.success) {
        return false;
      }
      
      // If we get options back and they have allowCredentials, user has passkeys
      return beginResponse.options?.allowCredentials?.length > 0;
    } catch (error) {
      console.warn('Error checking user passkeys:', error);
      return false;
    }
  }

  // Alias methods for component compatibility
  async register(email: string, name: string): Promise<PasskeyRegistrationResult> {
    return this.registerPasskey(email, name);
  }

  async authenticate(email?: string): Promise<PasskeyAuthenticationResult> {
    return this.authenticateWithPasskey(email);
  }

  // Passkey registration for new users
  async registerPasskey(email: string, name: string): Promise<PasskeyRegistrationResult> {
    try {
      if (!await this.isWebAuthnSupported()) {
        return {
          success: false,
          error: 'Passkeys are not supported in this browser',
        };
      }

      // Step 1: Get registration options from server
      const optionsResponse = await this.apiClient.post('/api/webauthn/register/begin', {
        email,
        name,
      });

      if (!optionsResponse.success) {
        return {
          success: false,
          error: optionsResponse.error || 'Failed to begin registration',
        };
      }

      // Step 2: Start registration with the browser
      const registrationResponse = await startRegistration({
        optionsJSON: optionsResponse.options,
      });

      // Step 3: Send registration response to server for verification
      const verificationResponse = await this.apiClient.post('/api/webauthn/register/complete', {
        response: registrationResponse,
        challengeId: optionsResponse.options.challengeId,
        email,
        name,
      });

      if (verificationResponse.success) {
        return {
          success: true,
          user: verificationResponse.user,
          message: 'Passkey registered successfully',
        };
      } else {
        return {
          success: false,
          error: verificationResponse.error || 'Failed to complete registration',
        };
      }
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      return {
        success: false,
        error: error.message || 'Failed to register passkey',
      };
    }
  }

  // Passkey authentication with conditional UI
  async authenticateWithPasskey(email?: string, useConditionalUI = false): Promise<PasskeyAuthenticationResult> {
    try {
      if (!await this.isWebAuthnSupported()) {
        return {
          success: false,
          error: 'Passkeys are not supported in this browser',
        };
      }

      // Step 1: Get authentication options from server
      const optionsResponse = await this.apiClient.post('/api/webauthn/authenticate/begin', {
        email,
      });

      if (!optionsResponse.success) {
        return {
          success: false,
          error: optionsResponse.error || 'Failed to begin authentication',
        };
      }

      // Step 2: Start authentication with the browser
      const authenticationResponse = await startAuthentication({
        optionsJSON: optionsResponse.options,
        useBrowserAutofill: useConditionalUI,
      });

      // Step 3: Send authentication response to server for verification
      const verificationResponse = await this.apiClient.post('/api/webauthn/authenticate/complete', {
        response: authenticationResponse,
        challengeId: optionsResponse.options.challengeId,
        email,
      });

      if (verificationResponse.success) {
        return {
          success: true,
          user: verificationResponse.user,
          sessionToken: verificationResponse.sessionToken,
          message: 'Authentication successful',
        };
      } else {
        return {
          success: false,
          error: verificationResponse.error || 'Failed to complete authentication',
        };
      }
    } catch (error: any) {
      console.error('Passkey authentication error:', error);
      return {
        success: false,
        error: error.message || 'Failed to authenticate with passkey',
      };
    }
  }

  // Add passkey to existing account (for OAuth users)
  async addPasskeyToAccount(): Promise<PasskeyRegistrationResult> {
    try {
      if (!await this.isWebAuthnSupported()) {
        return {
          success: false,
          error: 'Passkeys are not supported in this browser',
        };
      }

      // Step 1: Get registration options for existing user
      const optionsResponse = await this.apiClient.post('/api/webauthn/add-passkey/begin', {});

      if (!optionsResponse.success) {
        return {
          success: false,
          error: optionsResponse.error || 'Failed to begin passkey addition',
        };
      }

      // Step 2: Start registration with the browser
      const registrationResponse = await startRegistration({
        optionsJSON: optionsResponse.options,
      });

      // Step 3: Send registration response to server for verification
      const verificationResponse = await this.apiClient.post('/api/webauthn/add-passkey/complete', {
        response: registrationResponse,
        challengeId: optionsResponse.options.challengeId,
      });

      if (verificationResponse.success) {
        return {
          success: true,
          message: 'Passkey added to your account successfully',
        };
      } else {
        return {
          success: false,
          error: verificationResponse.error || 'Failed to add passkey',
        };
      }
    } catch (error: any) {
      console.error('Add passkey error:', error);
      return {
        success: false,
        error: error.message || 'Failed to add passkey to account',
      };
    }
  }

  // Conditional UI setup for forms
  async setupConditionalUI(inputElement: HTMLInputElement): Promise<void> {
    if (!await this.isConditionalUISupported()) {
      return;
    }

    try {
      // Set up the input for conditional UI
      inputElement.setAttribute('autocomplete', 'username webauthn');
      
      // Start conditional authentication
      this.authenticateWithPasskey(undefined, true).then((result) => {
        if (result.success) {
          // Dispatch custom event for successful authentication
          const event = new CustomEvent('passkeyAuthenticated', {
            detail: { user: result.user, sessionToken: result.sessionToken },
          });
          inputElement.dispatchEvent(event);
        }
      }).catch((error) => {
        console.warn('Conditional UI authentication failed:', error);
      });
    } catch (error) {
      console.warn('Failed to setup conditional UI:', error);
    }
  }

  // Passkey management methods
  async getUserPasskeys(userId: string): Promise<WebAuthnCredential[]> {
    try {
      const response = await this.apiClient.get(`/api/webauthn/users/${userId}/credentials`);
      return response.credentials || [];
    } catch (error) {
      console.error('Failed to get user passkeys:', error);
      return [];
    }
  }

  async deletePasskey(credentialId: string): Promise<boolean> {
    try {
      await this.apiClient.delete(`/api/webauthn/credentials/${credentialId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete passkey:', error);
      return false;
    }
  }

  async renamePasskey(credentialId: string, name: string): Promise<boolean> {
    try {
      await this.apiClient.patch(`/api/webauthn/credentials/${credentialId}`, { name });
      return true;
    } catch (error) {
      console.error('Failed to rename passkey:', error);
      return false;
    }
  }

  // Alias methods for component compatibility
  async getUserCredentials(userId: string): Promise<WebAuthnCredential[]> {
    return this.getUserPasskeys(userId);
  }

  async deleteCredential(credentialId: string): Promise<boolean> {
    return this.deletePasskey(credentialId);
  }

  async renameCredential(credentialId: string, name: string): Promise<boolean> {
    return this.renamePasskey(credentialId, name);
  }

  // Alias for addPasskeyToAccount
  async addPasskey(): Promise<PasskeyRegistrationResult> {
    return this.addPasskeyToAccount();
  }
}

export const webauthnClient = new WebAuthnClient();
// WebAuthn client implementation using @simplewebauthn/browser and server
// Handles passkey registration and authentication flows

import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/browser';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
} from '@simplewebauthn/server';
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

// WebAuthn configuration
const RP_ID = 'hamrah.app';
const RP_NAME = 'Hamrah App';
const RP_ORIGIN = 'https://hamrah.app';

/**
 * WebAuthn Client Class
 * Handles all passkey operations using SimpleWebAuthn
 */
export class WebAuthnClient {
  private apiClient = createApiClient();

  /**
   * Check if WebAuthn is supported in the current browser
   */
  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof window.navigator.credentials !== 'undefined'
    );
  }

  /**
   * Check if the user has existing passkeys for the given email
   */
  async hasPasskeys(email: string): Promise<boolean> {
    try {
      // First check if user exists
      const userResponse = await this.apiClient.get(`/api/users/by-email/${encodeURIComponent(email)}`);
      
      if (!userResponse.success || !userResponse.user) {
        return false;
      }

      // Check if user has any credentials
      const credentialsResponse = await this.apiClient.get(`/api/webauthn/users/${userResponse.user.id}/credentials`);
      
      return credentialsResponse.success && credentialsResponse.credentials && credentialsResponse.credentials.length > 0;
    } catch (error) {
      console.error('Error checking for passkeys:', error);
      return false;
    }
  }

  /**
   * Check if user exists and requires OAuth verification before passkey registration
   * Returns: { exists: boolean, requiresOAuth: boolean, user?: any }
   */
  async checkUserStatus(email: string): Promise<{
    exists: boolean;
    requiresOAuth: boolean;
    user?: any;
  }> {
    try {
      const userResponse = await this.apiClient.get(`/api/users/by-email/${encodeURIComponent(email)}`);
      
      if (!userResponse.success || !userResponse.user) {
        return { exists: false, requiresOAuth: false };
      }

      const user = userResponse.user;
      
      // User exists - check if they have OAuth authentication method
      const hasOAuth = user.auth_method === 'apple' || user.auth_method === 'google';
      
      return {
        exists: true,
        requiresOAuth: hasOAuth,
        user: user
      };
    } catch (error) {
      console.error('Error checking user status:', error);
      return { exists: false, requiresOAuth: false };
    }
  }

  /**
   * Register a new passkey for a user with proper security checks
   * Enforces rule: If signing up with passkey using existing email, must authenticate with OAuth first
   */
  async registerPasskeySecure(
    request: PasskeyRegistrationRequest, 
    oauthVerified = false
  ): Promise<PasskeyRegistrationResult & { requiresOAuth?: boolean; oauthUrl?: string }> {
    try {
      if (!WebAuthnClient.isSupported()) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      // Check user status first
      const userStatus = await this.checkUserStatus(request.email);
      
      if (userStatus.exists && userStatus.requiresOAuth && !oauthVerified) {
        // User exists with OAuth method - require OAuth verification first
        return {
          success: false,
          error: 'This email is associated with an existing account. Please sign in with Apple or Google first.',
          requiresOAuth: true,
          oauthUrl: '/auth/oauth'
        };
      }

      // If user exists but doesn't require OAuth, or if OAuth is verified, proceed
      return await this.registerPasskey(request);
    } catch (error) {
      console.error('Error in secure passkey registration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }

  /**
   * Register a new passkey for a user (internal method)
   */
  async registerPasskey(request: PasskeyRegistrationRequest): Promise<PasskeyRegistrationResult> {
    try {
      if (!WebAuthnClient.isSupported()) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      // Check if user already exists
      const userResponse = await this.apiClient.get(`/api/users/by-email/${encodeURIComponent(request.email)}`);
      let userId: string;
      let existingCredentials: WebAuthnCredential[] = [];

      if (userResponse.success && userResponse.user) {
        // User exists - get their existing credentials to exclude
        userId = userResponse.user.id;
        const credResponse = await this.apiClient.get(`/api/webauthn/users/${userId}/credentials`);
        if (credResponse.success && credResponse.credentials) {
          existingCredentials = credResponse.credentials;
        }
      } else {
        // New user - generate temporary user ID
        userId = crypto.randomUUID();
      }

      // Generate registration options
      const options: GenerateRegistrationOptionsOpts = {
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: userId,
        userName: request.email,
        userDisplayName: request.name,
        attestationType: 'none',
        excludeCredentials: existingCredentials.map(cred => ({
          id: cred.id,
          type: 'public-key' as const,
          transports: cred.transports as AuthenticatorTransport[] || [],
        })),
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
      };

      const registrationOptions = await generateRegistrationOptions(options);

      // Store challenge in database
      const challengeId = crypto.randomUUID();
      await this.apiClient.post('/api/webauthn/challenges', {
        id: challengeId,
        challenge: registrationOptions.challenge,
        user_id: userId,
        challenge_type: 'registration',
        expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      // Start registration with the browser
      const registrationResponse = await startRegistration(registrationOptions);

      // Verify the registration response
      const verificationResponse = await this.verifyRegistration({
        response: registrationResponse,
        expectedChallenge: registrationOptions.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verificationResponse.verified || !verificationResponse.registrationInfo) {
        throw new Error('Registration verification failed');
      }

      // Create user if they don't exist
      if (!userResponse.success || !userResponse.user) {
        await this.apiClient.post('/api/internal/users', {
          id: userId,
          email: request.email,
          name: request.name,
          auth_method: 'webauthn',
        });
      }

      // Store the credential
      const { credentialID, credentialPublicKey, counter } = verificationResponse.registrationInfo;
      
      await this.apiClient.post('/api/webauthn/credentials', {
        id: Buffer.from(credentialID).toString('base64url'),
        user_id: userId,
        public_key: Buffer.from(credentialPublicKey).toString('base64'),
        counter,
        transports: registrationResponse.response.transports || [],
        credential_type: 'public-key',
        user_verified: true,
        credential_backed_up: true,
        name: 'Passkey',
      });

      // Clean up challenge
      await this.apiClient.delete(`/api/webauthn/challenges/${challengeId}`);

      return { success: true };
    } catch (error) {
      console.error('Passkey registration failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Authenticate user with passkey
   */
  async authenticateWithPasskey(request: PasskeyAuthenticationRequest): Promise<PasskeyAuthenticationResult> {
    try {
      if (!WebAuthnClient.isSupported()) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      // Get user and their credentials
      const userResponse = await this.apiClient.get(`/api/users/by-email/${encodeURIComponent(request.email)}`);
      
      if (!userResponse.success || !userResponse.user) {
        throw new Error('User not found');
      }

      const userId = userResponse.user.id;
      const credResponse = await this.apiClient.get(`/api/webauthn/users/${userId}/credentials`);
      
      if (!credResponse.success || !credResponse.credentials || credResponse.credentials.length === 0) {
        throw new Error('No passkeys found for this user');
      }

      // Generate authentication options
      const credentials: WebAuthnCredential[] = credResponse.credentials;
      const options: GenerateAuthenticationOptionsOpts = {
        timeout: 60000,
        allowCredentials: credentials.map(cred => ({
          id: cred.id,
          type: 'public-key' as const,
          transports: cred.transports as AuthenticatorTransport[] || [],
        })),
        userVerification: 'preferred',
        rpID: RP_ID,
      };

      const authOptions = await generateAuthenticationOptions(options);

      // Store challenge
      const challengeId = crypto.randomUUID();
      await this.apiClient.post('/api/webauthn/challenges', {
        id: challengeId,
        challenge: authOptions.challenge,
        user_id: userId,
        challenge_type: 'authentication',
        expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      // Start authentication
      const authResponse = await startAuthentication(authOptions);

      // Find the credential that was used
      const usedCredential = credentials.find(cred => 
        Buffer.from(cred.id, 'base64url').equals(Buffer.from(authResponse.rawId, 'base64url'))
      );

      if (!usedCredential) {
        throw new Error('Unknown credential used');
      }

      // Verify authentication response
      const verificationResponse = await this.verifyAuthentication({
        response: authResponse,
        expectedChallenge: authOptions.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
          credentialID: Buffer.from(usedCredential.id, 'base64url'),
          credentialPublicKey: Buffer.from(usedCredential.public_key, 'base64'),
          counter: usedCredential.counter,
          transports: usedCredential.transports as AuthenticatorTransport[],
        },
      });

      if (!verificationResponse.verified) {
        throw new Error('Authentication verification failed');
      }

      // Update credential counter
      await this.apiClient.patch(`/api/webauthn/credentials/${usedCredential.id}/counter`, {
        counter: verificationResponse.authenticationInfo.newCounter,
        last_used: Date.now(),
      });

      // Create session
      const sessionResponse = await this.apiClient.post('/api/internal/sessions', {
        user_id: userId,
        expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      // Clean up challenge
      await this.apiClient.delete(`/api/webauthn/challenges/${challengeId}`);

      return {
        success: true,
        user: userResponse.user,
        session_token: sessionResponse.session?.id,
      };
    } catch (error) {
      console.error('Passkey authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Get user's passkeys for management
   */
  async getUserPasskeys(userId: string): Promise<WebAuthnCredential[]> {
    try {
      const response = await this.apiClient.get(`/api/webauthn/users/${userId}/credentials`);
      
      if (!response.success) {
        throw new Error('Failed to fetch passkeys');
      }

      return response.credentials || [];
    } catch (error) {
      console.error('Error fetching passkeys:', error);
      return [];
    }
  }

  /**
   * Delete a passkey
   */
  async deletePasskey(credentialId: string): Promise<boolean> {
    try {
      const response = await this.apiClient.delete(`/api/webauthn/credentials/${credentialId}`);
      return response.success;
    } catch (error) {
      console.error('Error deleting passkey:', error);
      return false;
    }
  }

  /**
   * Rename a passkey
   */
  async renamePasskey(credentialId: string, name: string): Promise<boolean> {
    try {
      const response = await this.apiClient.patch(`/api/webauthn/credentials/${credentialId}/name`, {
        name,
      });
      return response.success;
    } catch (error) {
      console.error('Error renaming passkey:', error);
      return false;
    }
  }

  // Private helper methods
  private async verifyRegistration(opts: VerifyRegistrationResponseOpts) {
    return await verifyRegistrationResponse(opts);
  }

  private async verifyAuthentication(opts: VerifyAuthenticationResponseOpts) {
    return await verifyAuthenticationResponse(opts);
  }
}

// Export singleton instance
export const webauthnClient = new WebAuthnClient();
/**
 * Internal service binding client for hamrah-api
 * Provides secure server-to-server communication between hamrah-app and hamrah-api
 */

import type { RequestEventCommon } from '@builder.io/qwik-city';

export interface AuthApiUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  auth_method: string | null;
  created_at: string;
}

export interface AuthApiResponse<T = any> {
  success: boolean;
  user?: T;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

export interface CreateUserRequest {
  email: string;
  name?: string;
  picture?: string;
  auth_method: string;
  provider: string;
  provider_id: string;
  platform: 'web' | 'ios';
  user_agent?: string;
  client_attestation?: string; // For iOS App Attestation
}

export interface SessionRequest {
  user_id: string;
  platform: 'web' | 'ios';
}

/**
 * Internal auth API client using Cloudflare service bindings
 */
export class AuthApiClient {
  private authService: Fetcher;
  private internalKey: string;

  constructor(event: RequestEventCommon) {
    this.authService = event.platform.env.AUTH_API;
    this.internalKey = event.platform.env.INTERNAL_API_KEY || '';
  }

  /**
   * Create a new user via internal API
   */
  async createUser(userData: CreateUserRequest): Promise<AuthApiResponse<AuthApiUser>> {
    return this.makeInternalCall('/api/internal/users', {
      method: 'POST',
      body: userData,
    });
  }

  /**
   * Create a web session via internal API
   */
  async createSession(sessionData: SessionRequest): Promise<AuthApiResponse<AuthApiUser>> {
    return this.makeInternalCall('/api/internal/sessions', {
      method: 'POST',
      body: sessionData,
    });
  }

  /**
   * Create API tokens for mobile apps via internal API
   */
  async createTokens(userData: CreateUserRequest): Promise<AuthApiResponse<AuthApiUser>> {
    return this.makeInternalCall('/api/internal/tokens', {
      method: 'POST',
      body: userData,
    });
  }

  /**
   * Validate session via internal API
   */
  async validateSession(sessionToken: string): Promise<AuthApiResponse<AuthApiUser>> {
    return this.makeInternalCall('/api/internal/sessions/validate', {
      method: 'POST',
      body: { session_token: sessionToken },
    });
  }

  /**
   * Get user by ID via internal API
   */
  async getUser(userId: string): Promise<AuthApiResponse<AuthApiUser>> {
    return this.makeInternalCall(`/api/internal/users/${userId}`, {
      method: 'GET',
    });
  }

  /**
   * Update user via internal API
   */
  async updateUser(userId: string, updates: Partial<CreateUserRequest>): Promise<AuthApiResponse<AuthApiUser>> {
    return this.makeInternalCall(`/api/internal/users/${userId}`, {
      method: 'PUT',
      body: updates,
    });
  }

  /**
   * Revoke all user sessions/tokens
   */
  async revokeUserSessions(userId: string): Promise<AuthApiResponse> {
    return this.makeInternalCall(`/api/internal/users/${userId}/sessions/revoke`, {
      method: 'DELETE',
    });
  }

  /**
   * Internal service-to-service call with authentication
   */
  private async makeInternalCall<T = any>(
    endpoint: string, 
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
    }
  ): Promise<AuthApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Internal-Service': 'hamrah-app',
        'X-Internal-Key': this.internalKey,
        'User-Agent': 'hamrah-app-internal/1.0',
      };

      const requestInit: RequestInit = {
        method: options.method,
        headers,
      };

      if (options.body && (options.method === 'POST' || options.method === 'PUT')) {
        requestInit.body = JSON.stringify(options.body);
      }

      const response = await this.authService.fetch(endpoint, requestInit);
      const data = await response.json() as AuthApiResponse<T>;

      if (!response.ok) {
        console.error(`Auth API call failed: ${response.status}`, data);
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
        };
      }

      return data;
    } catch (error) {
      console.error('Auth API service binding failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Service unavailable',
      };
    }
  }
}

/**
 * Helper to create auth API client from request event
 */
export function createAuthApiClient(event: RequestEventCommon): AuthApiClient {
  return new AuthApiClient(event);
}

/**
 * Verify iOS App Attestation for secure user creation
 */
export async function verifyIOSAttestation(
  attestation: string,
  challenge: string,
  keyId: string
): Promise<boolean> {
  try {
    // iOS App Attestation verification logic
    // This would typically verify the attestation statement against:
    // 1. Apple's App Attest service
    // 2. Your app's bundle ID
    // 3. The challenge data
    // 4. The key authenticity
    
    // Placeholder - implement proper App Attestation verification
    const response = await fetch('https://api.apple.com/v1/attest/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attestation,
        challenge,
        keyId,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('iOS App Attestation verification failed:', error);
    return false;
  }
}

/**
 * Platform validation for secure user creation
 */
export function validateClientPlatform(
  platform: string,
  userAgent: string,
  origin: string,
  attestation?: string
): { valid: boolean; reason?: string } {
  switch (platform) {
    case 'web':
      // Web platform validation
      if (!origin.includes('hamrah.app') && !origin.includes('localhost')) {
        return { valid: false, reason: 'Invalid web origin' };
      }
      return { valid: true };

    case 'ios':
      // iOS platform validation
      if (!userAgent.includes('CFNetwork') && !userAgent.includes('hamrahIOS')) {
        return { valid: false, reason: 'Invalid iOS user agent' };
      }
      
      // Require App Attestation for iOS
      if (!attestation) {
        return { valid: false, reason: 'iOS App Attestation required' };
      }
      
      return { valid: true };


    default:
      return { valid: false, reason: 'Unsupported platform' };
  }
}
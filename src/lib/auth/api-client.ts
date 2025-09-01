/**
 * Centralized API client for hamrah-api communication.
 */
import type { RequestEventCommon } from '@builder.io/qwik-city';
import type {
  ApiWebAuthnCredential,
  WebAuthnCredentialForStorage,
  WebAuthnCredentialFromApi,
} from '~/lib/webauthn/types';

export interface ApiUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  auth_method?: string;
  created_at: string;
  provider?: string | null;
  providerId?: string | null;
  emailVerified?: Date | null;
  lastLoginPlatform?: string | null;
  lastLoginAt?: Date | null;
  updatedAt?: Date;
}

// Re-export WebAuthn types from consolidated types file
export type { ApiWebAuthnCredential as WebAuthnCredential } from '~/lib/webauthn/types';

export interface ApiAuthResponse {
  success: boolean;
  user?: ApiUser;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  session?: any; // For compatibility with existing code
  expiresAt?: Date; // For compatibility with existing code
}

export interface CreateUserRequest {
  email: string;
  name?: string;
  picture?: string;
  auth_method: string;
  provider: string;
  provider_id: string;
  platform: "web" | "ios";
  user_agent?: string;
  client_attestation?: string;
}

export interface SessionRequest {
  user_id: string;
  platform: "web" | "ios";
}

export interface SessionValidationRequest {
  session_token: string;
}

/**
 * API client for hamrah-api service calls via HTTP(S).
 */
export class HamrahApiClient {
  private baseUrl: string;
  private event: RequestEventCommon;

  constructor(event: RequestEventCommon, baseUrl = 'https://api.hamrah.app') {
    this.baseUrl = baseUrl;
    this.event = event;
  }

  private async fetchApi<T>(
    path: string,
    options: RequestInit = {},
    withCredentials = true
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    // Forward cookies for SSR (if present)
    if (withCredentials && this.event.request.headers.has('cookie')) {
      headers['cookie'] = this.event.request.headers.get('cookie')!;
    }

    const resp = await fetch(url, {
      ...options,
      headers,
      credentials: withCredentials ? 'include' : 'same-origin',
    });

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({}));
      throw new Error((error as any)?.error || (error as any)?.message || `API error: ${resp.status}`);
    }
    return resp.json();
  }

  // WebAuthn: List credentials for current user
  async listWebAuthnCredentials(): Promise<ApiWebAuthnCredential[]> {
    const data = await this.fetchApi<{ credentials: ApiWebAuthnCredential[] }>(
      '/api/webauthn/credentials',
      { method: 'GET' }
    );
    return data.credentials;
  }

  // User: Create a new user
  async createUser(params: {
    email: string;
    name?: string;
    picture?: string;
    auth_method: string;
    provider: string;
    provider_id: string;
    platform: "web" | "ios";
    user_agent?: string;
    client_attestation?: string;
  }): Promise<{ success: boolean; user?: ApiUser }> {
    const data = await this.fetchApi<{ success: boolean; user?: ApiUser }>(
      '/api/internal/users',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return data;
  }

  // Session: Create a new session
  async createSession(params: { user_id: string; platform: "web" | "ios" }): Promise<{ success: boolean; session: any }> {
    const data = await this.fetchApi<{ success: boolean; session: any }>(
      '/api/internal/sessions',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return data;
  }

  // Session: Validate a session token
  async validateSession(params: { session_token: string }): Promise<{ success: boolean; valid: boolean; user?: ApiUser; session?: any }> {
    const data = await this.fetchApi<{ success: boolean; valid: boolean; user?: ApiUser; session?: any }>(
      '/api/internal/sessions/validate',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return data;
  }

  // Token: Create API tokens for mobile
  async createTokens(params: { user_id: string; platform: "web" | "ios" }): Promise<{ success: boolean; access_token: string; refresh_token: string; expires_in: number }> {
    const data = await this.fetchApi<{ success: boolean; access_token: string; refresh_token: string; expires_in: number }>(
      '/api/internal/tokens',
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
    return data;
  }

  // User: Get user by ID
  async getUserById(params: { userId: string }): Promise<{ success: boolean; user?: ApiUser }> {
    const data = await this.fetchApi<{ success: boolean; user?: ApiUser }>(
      `/api/users/${params.userId}`,
      {
        method: 'GET',
      }
    );
    return data;
  }

  // WebAuthn: Delete a credential
  async deleteWebAuthnCredential(credentialId: string): Promise<boolean> {
    await this.fetchApi(`/api/webauthn/credentials/${credentialId}`, {
      method: 'DELETE',
    });
    return true;
  }

  // WebAuthn: Update credential name
  async updateWebAuthnCredentialName(credentialId: string, name: string): Promise<boolean> {
    await this.fetchApi(`/api/webauthn/credentials/${credentialId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    return true;
  }

  // WebAuthn: Registration options for new user
  async getWebAuthnRegistrationOptionsForNewUser(params: { email: string; name: string }): Promise<any> {
    return await this.fetchApi('/api/webauthn/register/begin', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // WebAuthn: Registration options for existing user
  async getWebAuthnRegistrationOptionsForExistingUser(params: { userId: string; email: string; name?: string }): Promise<any> {
    return await this.fetchApi('/api/webauthn/register/begin', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // WebAuthn: Verify registration response
  async verifyWebAuthnRegistration(params: { response: any; challengeId: string; userId?: string; email?: string; name?: string }): Promise<any> {
    // The API expects challenge_id, response, email, name
    return await this.fetchApi('/api/webauthn/register/complete', {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: params.challengeId,
        response: params.response,
        email: params.email,
        name: params.name,
      }),
    });
  }

  // WebAuthn: Authentication options
  async getWebAuthnAuthenticationOptions(params: { email?: string }): Promise<any> {
    return await this.fetchApi('/api/webauthn/authenticate/begin', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // WebAuthn: Verify authentication response
  async verifyWebAuthnAuthentication(params: { response: any; challengeId: string }): Promise<any> {
    return await this.fetchApi('/api/webauthn/authenticate/complete', {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: params.challengeId,
        response: params.response,
      }),
    });
  }

  // ===== NEW WEBAUTHN PERSISTENCE METHODS =====
  // These methods call hamrah-api for data persistence only
  
  // Get user by email
  async getUserByEmail(params: { email: string }): Promise<ApiUser | null> {
    try {
      const data = await this.fetchApi<{ success: boolean; user?: ApiUser }>(
        `/api/users/by-email/${encodeURIComponent(params.email)}`,
        { method: 'GET' }
      );
      return data.user || null;
    } catch (error) {
      // User not found is expected
      return null;
    }
  }

  // Get WebAuthn credentials for a specific user
  async getWebAuthnCredentials(userId: string): Promise<{ credentials: ApiWebAuthnCredential[] }> {
    const data = await this.fetchApi<{ success: boolean; credentials: ApiWebAuthnCredential[] }>(
      `/api/webauthn/users/${userId}/credentials`,
      { method: 'GET' }
    );
    return { credentials: data.credentials || [] };
  }

  // Store a new WebAuthn credential
  async storeWebAuthnCredential(credential: WebAuthnCredentialForStorage): Promise<{ success: boolean }> {
    // Convert Uint8Arrays to base64
    const serializedCredential = {
      ...credential,
      public_key: Array.from(credential.public_key),
      aaguid: credential.aaguid ? Array.from(credential.aaguid) : undefined,
    };

    return await this.fetchApi<{ success: boolean }>(
      '/api/webauthn/credentials',
      {
        method: 'POST',
        body: JSON.stringify(serializedCredential),
      }
    );
  }

  // Get a specific WebAuthn credential by ID
  async getWebAuthnCredentialById(credentialId: string): Promise<WebAuthnCredentialFromApi | null> {
    try {
      const data = await this.fetchApi<{ 
        success: boolean; 
        credential?: {
          id: string;
          user_id: string;
          public_key: number[];
          counter: number;
          transports?: string[];
          aaguid?: number[];
        }
      }>(
        `/api/webauthn/credentials/${credentialId}`,
        { method: 'GET' }
      );
      
      if (!data.credential) {
        return null;
      }

      // Convert arrays back to Uint8Arrays
      return {
        ...data.credential,
        public_key: new Uint8Array(data.credential.public_key),
        aaguid: data.credential.aaguid ? new Uint8Array(data.credential.aaguid) : undefined,
      };
    } catch (error) {
      return null;
    }
  }

  // Update WebAuthn credential counter and last used
  async updateWebAuthnCredentialCounter(credentialId: string, update: {
    counter: number;
    last_used: number;
  }): Promise<{ success: boolean }> {
    return await this.fetchApi<{ success: boolean }>(
      `/api/webauthn/credentials/${credentialId}/counter`,
      {
        method: 'PATCH',
        body: JSON.stringify(update),
      }
    );
  }

  // Store WebAuthn challenge (temporary)
  async storeWebAuthnChallenge(challenge: {
    id: string;
    challenge: string;
    user_id?: string;
    challenge_type: 'registration' | 'authentication';
    expires_at: number;
  }): Promise<{ success: boolean }> {
    return await this.fetchApi<{ success: boolean }>(
      '/api/webauthn/challenges',
      {
        method: 'POST',
        body: JSON.stringify(challenge),
      }
    );
  }

  // Get WebAuthn challenge
  async getWebAuthnChallenge(challengeId: string): Promise<{
    id: string;
    challenge: string;
    user_id?: string;
    challenge_type: 'registration' | 'authentication';
    expires_at: number;
  } | null> {
    try {
      const data = await this.fetchApi<{ 
        success: boolean; 
        challenge?: {
          id: string;
          challenge: string;
          user_id?: string;
          challenge_type: 'registration' | 'authentication';
          expires_at: number;
        }
      }>(
        `/api/webauthn/challenges/${challengeId}`,
        { method: 'GET' }
      );
      return data.challenge || null;
    } catch (error) {
      return null;
    }
  }

  // Delete WebAuthn challenge
  async deleteWebAuthnChallenge(challengeId: string): Promise<{ success: boolean }> {
    return await this.fetchApi<{ success: boolean }>(
      `/api/webauthn/challenges/${challengeId}`,
      { method: 'DELETE' }
    );
  }
}

export function createApiClient(event: RequestEventCommon): HamrahApiClient {
  return new HamrahApiClient(event);
}

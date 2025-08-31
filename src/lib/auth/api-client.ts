/**
 * Centralized API client for hamrah-api communication.
 */
import type { RequestEventCommon } from '@builder.io/qwik-city';

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

export interface WebAuthnCredential {
  id: string;
  name?: string | null;
  created_at: string;
  last_used?: string | null;
}

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
  async listWebAuthnCredentials(): Promise<WebAuthnCredential[]> {
    const data = await this.fetchApi<{ credentials: WebAuthnCredential[] }>(
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
}

export function createApiClient(event: RequestEventCommon): HamrahApiClient {
  return new HamrahApiClient(event);
}

/**
 * Internal API client for hamrah-api service binding communication.
 * ONLY to be used in server$ functions - never in client-side code.
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

export interface InternalAuthResponse {
  success: boolean;
  user?: ApiUser;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  session?: any;
  expiresAt?: Date;
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
 * Internal API client for hamrah-api service binding calls.
 * Uses AUTH_API service binding for authenticated internal communication.
 */
export class InternalApiClient {
  private authApiService: Fetcher;
  private event: RequestEventCommon;

  constructor(event: RequestEventCommon) {
    this.event = event;
    // Get the AUTH_API service binding from Cloudflare environment
    this.authApiService = (event.platform.env as any).AUTH_API as Fetcher;
    
    if (!this.authApiService) {
      throw new Error('AUTH_API service binding not found. Ensure this is only called server-side.');
    }
  }

  private async fetchInternal<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Add service identification headers for logging
      'x-service-name': 'hamrah-web',
      'x-request-id': crypto.randomUUID(),
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await this.authApiService.fetch(`https://api.hamrah.app${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as any)?.error || (error as any)?.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  // Internal endpoint: Create a new user
  async createUser(params: CreateUserRequest): Promise<InternalAuthResponse> {
    return this.fetchInternal<InternalAuthResponse>('/api/internal/users', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Internal endpoint: Create a new session
  async createSession(params: SessionRequest): Promise<InternalAuthResponse> {
    return this.fetchInternal<InternalAuthResponse>('/api/internal/sessions', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Internal endpoint: Validate a session token
  async validateSession(params: SessionValidationRequest): Promise<InternalAuthResponse> {
    return this.fetchInternal<InternalAuthResponse>('/api/internal/sessions/validate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Internal endpoint: Create API tokens for mobile
  async createTokens(params: CreateUserRequest): Promise<InternalAuthResponse> {
    return this.fetchInternal<InternalAuthResponse>('/api/internal/tokens', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Generic REST methods for internal API calls
  async get<T = any>(path: string): Promise<T> {
    return this.fetchInternal<T>(path, {
      method: 'GET',
    });
  }

  async post<T = any>(path: string, data?: any): Promise<T> {
    return this.fetchInternal<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = any>(path: string, data?: any): Promise<T> {
    return this.fetchInternal<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.fetchInternal<T>(path, {
      method: 'DELETE',
    });
  }
}

/**
 * Create an internal API client instance for service binding communication.
 * ONLY use this in server$ functions - never in client-side code.
 */
export function createInternalApiClient(event: RequestEventCommon): InternalApiClient {
  return new InternalApiClient(event);
}
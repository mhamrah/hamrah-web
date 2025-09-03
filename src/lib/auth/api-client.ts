/**
 * Public API client for hamrah-api cookie-based authentication.
 * Uses external endpoints that work with both client and server-side code.
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

export interface ApiAuthResponse {
  success: boolean;
  user?: ApiUser;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

export interface TokenRefreshRequest {
  refresh_token: string;
}

export interface NativeAuthRequest {
  provider: string;
  credential: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Public API client for hamrah-api communication via external endpoints.
 * Uses cookie-based authentication for session validation.
 * Safe to use on both client and server side.
 */
export class HamrahApiClient {
  private baseUrl: string;
  private event?: RequestEventCommon;

  constructor(event?: RequestEventCommon, baseUrl = 'https://api.hamrah.app') {
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
    if (withCredentials && this.event?.request.headers.has('cookie')) {
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

  // Public endpoint: Validate session via cookie
  async validateSession(): Promise<ApiAuthResponse> {
    return this.fetchApi<ApiAuthResponse>('/api/auth/sessions/validate', {
      method: 'GET',
    });
  }

  // Public endpoint: Logout session
  async logout(): Promise<{ success: boolean; message: string }> {
    return this.fetchApi<{ success: boolean; message: string }>(
      '/api/auth/sessions/logout',
      {
        method: 'POST',
      }
    );
  }

  // Public endpoint: Refresh access token
  async refreshToken(params: TokenRefreshRequest): Promise<ApiAuthResponse> {
    return this.fetchApi<ApiAuthResponse>('/api/auth/tokens/refresh', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Generic REST methods for public API calls
  async get<T = any>(path: string): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'GET',
    });
  }

  async post<T = any>(path: string, data?: any): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = any>(path: string, data?: any): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'DELETE',
    });
  }

  // Public endpoint: Revoke specific token
  async revokeToken(tokenId: string): Promise<{ success: boolean; message: string }> {
    return this.fetchApi<{ success: boolean; message: string }>(
      `/api/auth/tokens/${tokenId}/revoke`,
      {
        method: 'DELETE',
      }
    );
  }

  // Public endpoint: Revoke all user tokens
  async revokeAllUserTokens(userId: string): Promise<{ success: boolean; message: string }> {
    return this.fetchApi<{ success: boolean; message: string }>(
      `/api/auth/users/${userId}/tokens/revoke`,
      {
        method: 'DELETE',
      }
    );
  }

  // Public endpoint: Native app authentication
  async nativeAuth(params: NativeAuthRequest): Promise<ApiAuthResponse> {
    return this.fetchApi<ApiAuthResponse>('/api/auth/native', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Generic fetch methods for WebAuthn endpoints
  async get<T = any>(path: string): Promise<T> {
    return this.fetchApi<T>(path, { method: 'GET' });
  }

  async post<T = any>(path: string, body: any): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T = any>(path: string, body: any): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async patch<T = any>(path: string, body: any): Promise<T> {
    return this.fetchApi<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.fetchApi<T>(path, { method: 'DELETE' });
  }
}

/**
 * Create a public API client for cookie-based authentication.
 * Safe to use on both client and server side.
 */
export function createApiClient(event?: RequestEventCommon): HamrahApiClient {
  return new HamrahApiClient(event);
}

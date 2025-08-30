import type { RequestEventCommon } from "@builder.io/qwik-city";

// Types for API responses
export interface ApiUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  auth_method?: string;
  created_at: string;
  // Additional properties to match database User type
  provider?: string | null;
  providerId?: string | null;
  emailVerified?: Date | null;
  authMethod?: string | null;
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
 * API client for hamrah-api service calls via Cloudflare service bindings
 * Relies on Cloudflare's built-in service binding authentication
 */
export class HamrahApiClient {
  private event: RequestEventCommon;
  private authApiService: Fetcher;

  constructor(event: RequestEventCommon) {
    this.event = event;
    this.authApiService = event.platform.env.AUTH_API as Fetcher;

    if (!this.authApiService) {
      throw new Error("AUTH_API service binding not configured");
    }
  }

  private async makeInternalApiCall(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'X-Service-Name': 'hamrah-app', // For logging and identification
      'X-Request-ID': crypto.randomUUID(), // For request tracing
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.authApiService.fetch(`https://api/api/internal${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Create or update user and return tokens for native apps
   */
  async createTokens(request: CreateUserRequest): Promise<ApiAuthResponse> {
    return await this.makeInternalApiCall('/tokens', 'POST', request);
  }

  /**
   * Create user (for web flows)
   */
  async createUser(request: CreateUserRequest): Promise<ApiAuthResponse> {
    return await this.makeInternalApiCall('/users', 'POST', request);
  }

  /**
   * Create web session
   */
  async createSession(request: SessionRequest): Promise<ApiAuthResponse> {
    return await this.makeInternalApiCall('/sessions', 'POST', request);
  }

  /**
   * Validate session token
   */
  async validateSession(request: SessionValidationRequest): Promise<ApiAuthResponse> {
    return await this.makeInternalApiCall('/sessions/validate', 'POST', request);
  }
}

/**
 * Factory function to create API client instance
 */
export function createApiClient(event: RequestEventCommon): HamrahApiClient {
  return new HamrahApiClient(event);
}
import type { RequestHandler } from "@builder.io/qwik-city";
import { verifyAppleToken, verifyGoogleToken } from "~/lib/auth/providers";
import {
  createAuthApiClient,
  validateClientPlatform,
} from "~/lib/auth/auth-api-client";
// Rate limiting removed with OIDC cleanup

interface NativeAuthRequest {
  provider?: "apple" | "google";
  credential?: string; // ID token from the provider
  email?: string;
  name?: string;
  picture?: string;
  platform?: "ios" | "api";
  client_attestation?: string; // iOS App Attestation
}

interface NativeAuthResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
    authMethod: string;
    createdAt: string;
  };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

/**
 * Native Authentication API for iOS/Android apps
 * Handles Apple Sign-In, Google Sign-In tokens and creates/links users
 *
 * POST /api/auth/native
 */
export const onPost: RequestHandler = async (event) => {
  try {
    const body = (await event.parseBody()) as NativeAuthRequest;
    const {
      provider,
      credential,
      email,
      name,
      picture,
      platform = "api",
      client_attestation,
    } = body;
    const userAgent = event.request.headers.get("User-Agent") || "";
    const origin = event.request.headers.get("Origin") || "";

    if (!provider || !credential) {
      event.json(400, {
        success: false,
        error: "Missing required fields: provider, credential",
      } as NativeAuthResponse);
      return;
    }

    // Validate client platform and requirements
    const platformValidation = validateClientPlatform(
      platform,
      userAgent,
      origin,
      client_attestation,
    );
    if (!platformValidation.valid) {
      console.warn(`🚫 Invalid client platform: ${platformValidation.reason}`);
      event.json(403, {
        success: false,
        error: platformValidation.reason || "Invalid client",
      } as NativeAuthResponse);
      return;
    }

    // Verify the credential with the appropriate provider (OAuth tokens stay in web layer)
    let providerData: {
      email: string;
      name?: string;
      picture?: string;
      providerId: string;
    };

    switch (provider) {
      case "apple":
        providerData = await verifyAppleToken(credential, event);
        break;
      case "google":
        providerData = await verifyGoogleToken(credential, event);
        break;
      default:
        event.json(400, {
          success: false,
          error: "Unsupported provider",
        } as NativeAuthResponse);
        return;
    }

    // Override with provided data if available (for privacy-focused providers like Apple)
    if (email) providerData.email = email;
    if (name) providerData.name = name;
    if (picture) providerData.picture = picture;

    // Create auth API client and call internal API
    const authApi = createAuthApiClient(event);

    const apiResponse = await authApi.createTokens({
      email: providerData.email,
      name: providerData.name,
      picture: providerData.picture,
      auth_method: provider,
      provider,
      provider_id: providerData.providerId,
      platform: platform as "web" | "ios",
      user_agent: userAgent,
      client_attestation,
    });

    if (!apiResponse.success) {
      console.error("Auth API error:", apiResponse.error);
      event.json(400, {
        success: false,
        error: apiResponse.error || "Authentication failed",
      } as NativeAuthResponse);
      return;
    }

    // Return successful response with tokens
    const response: NativeAuthResponse = {
      success: true,
      user: apiResponse.user
        ? {
            id: apiResponse.user.id,
            email: apiResponse.user.email,
            name: apiResponse.user.name || "User",
            picture: apiResponse.user.picture,
            authMethod: apiResponse.user.auth_method || "oauth",
            createdAt: apiResponse.user.created_at,
          }
        : undefined,
      accessToken: apiResponse.access_token,
      refreshToken: apiResponse.refresh_token,
      expiresIn: apiResponse.expires_in,
    };

    console.log(
      `✅ Native auth successful for ${platform}:`,
      providerData.email,
    );
    event.json(200, response);
  } catch (error) {
    console.error("Native authentication error:", error);

    let errorMessage = "Authentication failed";

    if (error instanceof Error) {
      if (
        error.message.includes("Invalid token") ||
        error.message.includes("verification failed")
      ) {
        errorMessage = "Invalid authentication credential";
      } else if (error.message.includes("App Attestation")) {
        errorMessage = "iOS App Attestation required";
      } else {
        errorMessage = error.message;
      }
    }

    event.json(400, {
      success: false,
      error: errorMessage,
    } as NativeAuthResponse);
  }
};

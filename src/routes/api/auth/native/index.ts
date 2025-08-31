import type { RequestHandler } from "@builder.io/qwik-city";
import { verifyAppleToken, verifyGoogleToken } from "~/lib/auth/providers";

// Cloudflare service binding types
interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}
// Rate limiting removed with OIDC cleanup

interface NativeAuthRequest {
  provider?: "apple" | "google";
  credential?: string; // ID token from the provider
  email?: string;
  name?: string;
  picture?: string;
  platform?: "web" | "ios";
  client_attestation?: string; // For iOS App Attestation
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
      platform = "web",
      client_attestation,
    } = body;
    const userAgent = event.request.headers.get("User-Agent") || "";
    const origin = event.request.headers.get("Origin") || "";

    // Basic client validation - more detailed validation is in the API
    const isValidRequest =
      userAgent.includes("CFNetwork") || // iOS requests
      userAgent.includes("hamrahIOS") || // iOS app identifier
      origin.includes("localhost") || // Local development
      origin.includes("hamrah.app") || // Production web
      event.request.headers.get("X-Requested-With") === "hamrah-ios"; // Custom header

    if (!isValidRequest) {
      console.warn(
        `🚫 Blocked unauthorized request from: ${userAgent}, origin: ${origin}`,
      );
      event.json(403, {
        success: false,
        error: "Unauthorized client",
      } as NativeAuthResponse);
      return;
    }

    if (!provider || !credential) {
      event.json(400, {
        success: false,
        error: "Missing required fields: provider, credential",
      } as NativeAuthResponse);
      return;
    }

    // Verify the credential with the appropriate provider
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

    // Call hamrah-api internal endpoint via service binding - this handles all DB operations
    const authApiService = event.platform.env.AUTH_API as Fetcher;

    const apiRequest = {
      email: providerData.email,
      name: providerData.name,
      picture: providerData.picture,
      auth_method: provider,
      provider,
      provider_id: providerData.providerId,
      platform: platform as "web" | "ios",
      user_agent: userAgent,
      client_attestation,
    };

    // Call the internal API via service binding (authentication handled by Cloudflare)
    const apiResponse = await authApiService.fetch(
      "https://api/internal/tokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Name": "hamrah-app", // For logging and identification
          "X-Request-ID": crypto.randomUUID(), // For request tracing
        },
        body: JSON.stringify(apiRequest),
      },
    );

    if (!apiResponse.ok) {
      const errorData = await apiResponse.text();
      throw new Error(`API call failed: ${apiResponse.status} - ${errorData}`);
    }

    const apiResult = (await apiResponse.json()) as {
      success: boolean;
      user?: {
        id: string;
        email: string;
        name?: string;
        picture?: string;
        auth_method?: string;
        created_at: string;
      };
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    // Return the response from the API
    const response: NativeAuthResponse = {
      success: true,
      user: apiResult.user
        ? {
            id: apiResult.user.id,
            email: apiResult.user.email,
            name: apiResult.user.name || "User",
            picture: apiResult.user.picture || null,
            authMethod: apiResult.user.auth_method || "oauth",
            createdAt: apiResult.user.created_at,
          }
        : undefined,
      accessToken: apiResult.access_token,
      refreshToken: apiResult.refresh_token,
      expiresIn: apiResult.expires_in,
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
      } else if (error.message.includes("rate limit")) {
        errorMessage =
          "Too many authentication attempts. Please try again later.";
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

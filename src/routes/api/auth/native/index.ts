import type { RequestHandler } from "@builder.io/qwik-city";
import { users } from "~/lib/db";
import { eq } from "drizzle-orm";
import { verifyAppleToken, verifyGoogleToken } from "~/lib/auth/providers";

import { createAuthApiClient } from "~/lib/auth/apiClient";
// Rate limiting removed with OIDC cleanup

interface NativeAuthRequest {
  provider?: "apple" | "google";
  credential?: string; // ID token from the provider
  email?: string;
  name?: string;
  picture?: string;
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

    // Allow requests from:
    // 1. iOS app (CFNetwork user agent)
    // 2. Local development
    // 3. Trusted web origins
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

    // Rate limiting removed with OIDC cleanup

    const body = (await event.parseBody()) as NativeAuthRequest;
    const { provider, credential, email, name, picture } = body;

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

    // Verify the credential with the appropriate provider
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

    // Check if user already exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, providerData.email));

    let user = existingUsers[0];

    if (existingUsers.length === 0) {
      // Create new user
      const userId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        email: providerData.email,
        name: providerData.name || null,
        picture: providerData.picture || null,
        emailVerified: new Date(), // Provider-verified email
        authMethod: provider,
        providerId: providerData.providerId,
        createdAt: now,
        updatedAt: now,
      });

      user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .then((rows) => rows[0]);

      console.log(`✅ Created new user via ${provider}:`, providerData.email);
    } else {
      // Update existing user if needed
      const updates: any = {
        updatedAt: now,
        lastLoginAt: now,
      };

      // Update auth method and provider ID if this is a new provider for existing user
      if (user.authMethod !== provider) {
        updates.authMethod = provider;
        updates.providerId = providerData.providerId;
      }

      // Update profile info if provided and different
      if (providerData.name && user.name !== providerData.name) {
        updates.name = providerData.name;
      }
      if (providerData.picture && user.picture !== providerData.picture) {
        updates.picture = providerData.picture;
      }

      await db.update(users).set(updates).where(eq(users.id, user.id));

      // Refresh user data
      user = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .then((rows) => rows[0]);

      console.log(
        `✅ Updated existing user via ${provider}:`,
        providerData.email,
      );
    }

    // Return successful response
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

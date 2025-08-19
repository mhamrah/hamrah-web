import type { RequestHandler } from "@builder.io/qwik-city";
import { getDB, users } from "~/lib/db";
import { eq } from "drizzle-orm";
import { verifyAppleToken, verifyGoogleToken } from "~/lib/auth/providers";
import { generateTokens, createRefreshToken } from "~/lib/auth/tokens";
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

    let providerData: {
      email: string;
      name?: string;
      picture?: string;
      providerId: string;
    };

    // Verify the credential with the appropriate provider
    switch (provider) {
      case "apple":
        providerData = await verifyAppleToken(credential);
        break;
      case "google":
        providerData = await verifyGoogleToken(credential);
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

    const db = getDB(event);
    const now = new Date();

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

    // Generate access and refresh tokens
    const { accessToken, refreshTokenValue } = await generateTokens(
      event,
      user.id,
    );

    // Store refresh token
    await createRefreshToken(event, user.id, refreshTokenValue);

    // Return successful response
    const response: NativeAuthResponse = {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        authMethod: user.authMethod,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken,
      refreshToken: refreshTokenValue,
    };

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

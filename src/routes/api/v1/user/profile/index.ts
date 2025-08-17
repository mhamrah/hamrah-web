import type { RequestHandler } from '@builder.io/qwik-city';
import { requireJWTAuth, checkJWTRateLimit } from '../../../../../lib/auth/jwt-validator';
import { getDB, users } from '../../../../../lib/db';
import { eq } from 'drizzle-orm';

/**
 * Protected API endpoint - Get user profile
 * Requires valid JWT token from OIDC provider
 */
export const onGet: RequestHandler = async (event) => {
  try {
    // Rate limiting
    const clientId = event.request.headers.get('cf-connecting-ip') || 'unknown';
    const rateLimitOk = await checkJWTRateLimit(event, clientId);
    
    if (!rateLimitOk) {
      event.json(429, {
        error: 'rate_limit_exceeded',
        error_description: 'Rate limit exceeded',
      });
      return;
    }

    // Validate JWT token and require 'profile' scope
    const authResult = await requireJWTAuth(event, ['openid', 'profile']);
    
    if (!authResult.isValid) {
      event.json(401, {
        error: 'unauthorized',
        error_description: authResult.error || 'Authentication failed',
      });
      return;
    }

    const { user, payload } = authResult;

    // Return user profile data
    const profileData = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
      lastLoginAt: user.lastLoginAt,
      lastLoginPlatform: user.lastLoginPlatform,
      // Include token info for debugging (remove in production)
      tokenInfo: {
        clientId: payload?.client_id,
        scopes: authResult.scopes,
        issuedAt: payload?.iat,
        expiresAt: payload?.exp,
      },
    };

    event.json(200, profileData);

  } catch (error) {
    console.error('Profile API error:', error);
    
    event.json(500, {
      error: 'internal_error',
      error_description: 'An internal server error occurred',
    });
  }
};

/**
 * Update user profile
 */
export const onPatch: RequestHandler = async (event) => {
  try {
    // Rate limiting
    const clientId = event.request.headers.get('cf-connecting-ip') || 'unknown';
    const rateLimitOk = await checkJWTRateLimit(event, clientId);
    
    if (!rateLimitOk) {
      event.json(429, {
        error: 'rate_limit_exceeded',
        error_description: 'Rate limit exceeded',
      });
      return;
    }

    // Validate JWT token and require 'profile' scope
    const authResult = await requireJWTAuth(event, ['openid', 'profile']);
    
    if (!authResult.isValid) {
      event.json(401, {
        error: 'unauthorized',
        error_description: authResult.error || 'Authentication failed',
      });
      return;
    }

    // Parse request body
    const body = await event.request.json() as { name?: string; picture?: string };
    const { name, picture } = body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'Name is required and must be a non-empty string',
      });
      return;
    }

    if (picture && (typeof picture !== 'string' || picture.trim().length === 0)) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'Picture must be a valid URL string',
      });
      return;
    }

    // Update user in database
    const db = getDB(event);
    const updateData: { name: string; picture?: string; updatedAt: Date } = {
      name: name.trim(),
      updatedAt: new Date(),
    };

    if (picture) {
      updateData.picture = picture.trim();
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, authResult.user.id))
      .returning();

    if (!updatedUser) {
      event.json(404, {
        error: 'user_not_found',
        error_description: 'User not found',
      });
      return;
    }

    event.json(200, {
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        picture: updatedUser.picture,
        updatedAt: updatedUser.updatedAt,
      },
    });

  } catch (error) {
    console.error('Profile update error:', error);
    
    event.json(500, {
      error: 'internal_error',
      error_description: 'An internal server error occurred',
    });
  }
};
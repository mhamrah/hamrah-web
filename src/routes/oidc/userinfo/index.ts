import type { RequestHandler } from '@builder.io/qwik-city';
import { validateJWTToken, extractBearerToken } from '../../../lib/auth/jwt-validator';

/**
 * OpenID Connect UserInfo Endpoint
 * Returns user information for a valid access token
 */
export const onGet: RequestHandler = async (event) => {
  try {
    // Extract bearer token
    const token = extractBearerToken(event.request);
    
    if (!token) {
      event.headers.set('WWW-Authenticate', 'Bearer');
      event.json(401, {
        error: 'invalid_token',
        error_description: 'Bearer token required',
      });
      return;
    }

    // Validate JWT token
    const validation = await validateJWTToken(event, token);
    
    if (!validation.isValid || !validation.user || !validation.payload) {
      event.headers.set('WWW-Authenticate', 'Bearer');
      event.json(401, {
        error: 'invalid_token',
        error_description: validation.error || 'Invalid token',
      });
      return;
    }

    const { user, payload, scopes } = validation;

    // Build userinfo response based on granted scopes
    const userInfo: Record<string, any> = {
      sub: user.id,
    };

    // Add profile information if profile scope is granted
    if (scopes?.includes('profile')) {
      userInfo.name = user.name;
      userInfo.picture = user.picture;
      userInfo.updated_at = Math.floor(user.updatedAt.getTime() / 1000);
    }

    // Add email information if email scope is granted
    if (scopes?.includes('email')) {
      userInfo.email = user.email;
      userInfo.email_verified = true; // Assuming verified since we use OAuth providers
    }

    // Add additional claims from the token
    if (payload.auth_time) {
      userInfo.auth_time = payload.auth_time;
    }

    event.json(200, userInfo);

  } catch (error) {
    console.error('UserInfo endpoint error:', error);
    
    event.json(500, {
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
};

/**
 * Also support POST method as per OIDC spec
 */
export const onPost: RequestHandler = async (event) => {
  return onGet(event);
};
import type { RequestHandler } from '@builder.io/qwik-city';
import { getClient, validateClientCredentials } from '../../../lib/auth/client-manager';
import { validateJWTToken } from '../../../lib/auth/jwt-validator';

/**
 * OAuth 2.0 Token Introspection Endpoint
 * RFC 7662 - https://tools.ietf.org/html/rfc7662
 */
export const onPost: RequestHandler = async (event) => {
  try {
    // Parse form data
    const formData = await event.request.formData();
    const token = formData.get('token')?.toString();
    const clientId = formData.get('client_id')?.toString();
    const clientSecret = formData.get('client_secret')?.toString();

    // Validate required parameters
    if (!token) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'token parameter is required',
      });
      return;
    }

    if (!clientId) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'client_id parameter is required',
      });
      return;
    }

    // Validate client
    const client = await getClient(event, clientId);
    if (!client || !client.active) {
      event.json(401, {
        error: 'invalid_client',
        error_description: 'Invalid client',
      });
      return;
    }

    // Validate client credentials
    const isValidClient = await validateClientCredentials(event, clientId, clientSecret);
    if (!isValidClient) {
      event.json(401, {
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      });
      return;
    }

    // Validate the token
    const validation = await validateJWTToken(event, token);

    if (!validation.isValid || !validation.payload) {
      // Token is invalid or expired
      event.json(200, {
        active: false,
      });
      return;
    }

    const { payload, user, scopes } = validation;

    // Return token introspection response
    const introspectionResponse = {
      active: true,
      scope: scopes?.join(' ') || '',
      client_id: payload.client_id,
      username: user?.email || payload.sub,
      token_type: 'Bearer',
      exp: payload.exp,
      iat: payload.iat,
      sub: payload.sub,
      aud: payload.aud,
      iss: payload.iss,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };

    event.json(200, introspectionResponse);

  } catch (error) {
    console.error('Token introspection error:', error);
    
    // On error, return inactive token response
    event.json(200, {
      active: false,
    });
  }
};
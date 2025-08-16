import type { RequestHandler } from '@builder.io/qwik-city';
import { getClient, validateClientCredentials } from '../../../lib/auth/client-manager';
import { revokeToken } from '../../../lib/auth/tokens';

/**
 * OAuth 2.0 Token Revocation Endpoint
 * RFC 7009 - https://tools.ietf.org/html/rfc7009
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

    // Revoke the token
    await revokeToken(event, token);

    // According to RFC 7009, the revocation endpoint should return 200 OK
    // even if the token was not found or was already revoked
    event.status(200);
    event.send('');

  } catch (error) {
    console.error('Token revocation error:', error);
    
    event.json(500, {
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
};
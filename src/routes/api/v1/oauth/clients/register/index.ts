import type { RequestHandler } from '@builder.io/qwik-city';
import { registerClient } from '../../../../../../lib/auth/client-manager';
import type { ClientRegistration } from '../../../../../../lib/auth/client-manager';

/**
 * OAuth Client Registration API
 * Allows developers to register new OAuth clients for their applications
 * 
 * POST /api/v1/oauth/clients/register
 */
export const onPost: RequestHandler = async (event) => {
  try {
    // Parse request body
    const body = await event.request.json() as ClientRegistration;

    // Basic validation
    if (!body.client_name || !body.application_type || !body.redirect_uris || body.redirect_uris.length === 0) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'Missing required fields: client_name, application_type, redirect_uris',
      });
      return;
    }

    // Additional validation for mobile apps
    if (body.application_type === 'native') {
      // Ensure mobile apps use public client authentication
      if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') {
        event.json(400, {
          error: 'invalid_request',
          error_description: 'Native applications must use token_endpoint_auth_method: none',
        });
        return;
      }

      // Validate redirect URIs for mobile apps
      const invalidUris = body.redirect_uris.filter(uri => {
        try {
          const url = new URL(uri);
          // Allow custom scheme (hamrah://) or localhost for testing
          return url.protocol !== 'hamrah:' && 
                 url.hostname !== 'localhost' && 
                 url.hostname !== '127.0.0.1';
        } catch {
          return true; // Invalid URI format
        }
      });

      if (invalidUris.length > 0) {
        event.json(400, {
          error: 'invalid_redirect_uri',
          error_description: `Invalid redirect URIs for native app: ${invalidUris.join(', ')}. Use custom scheme (hamrah://) or localhost for testing.`,
        });
        return;
      }
    }

    // Register the client
    const clientResponse = await registerClient(event, body);

    event.json(201, clientResponse);

  } catch (error) {
    console.error('Client registration error:', error);

    if (error instanceof Error) {
      event.json(400, {
        error: 'invalid_request',
        error_description: error.message,
      });
      return;
    }

    event.json(500, {
      error: 'server_error',
      error_description: 'An internal server error occurred',
    });
  }
};

/**
 * Get client registration information
 * This endpoint provides example registration data for developers
 */
export const onGet: RequestHandler = async (event) => {
  const exampleRegistration = {
    client_name: 'Hamrah iOS App',
    application_type: 'native',
    redirect_uris: ['hamrah://auth/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scopes: ['openid', 'profile', 'email'],
    require_auth_time: true,
    default_max_age: 3600,
  };

  const documentation = {
    endpoint: '/api/v1/oauth/clients/register',
    method: 'POST',
    description: 'Register a new OAuth 2.0 client application',
    required_fields: [
      'client_name',
      'application_type',
      'redirect_uris'
    ],
    optional_fields: [
      'grant_types',
      'response_types', 
      'token_endpoint_auth_method',
      'scopes',
      'require_auth_time',
      'default_max_age'
    ],
    application_types: {
      native: 'Mobile and desktop applications',
      web: 'Web applications running on a server'
    },
    example_request: exampleRegistration,
    notes: [
      'Native applications must use token_endpoint_auth_method: none',
      'Native applications should use custom URI schemes like hamrah://auth/callback',
      'Web applications must use HTTPS redirect URIs (except localhost for development)',
      'Client secrets are only provided for confidential clients (web applications)'
    ]
  };

  event.json(200, documentation);
};
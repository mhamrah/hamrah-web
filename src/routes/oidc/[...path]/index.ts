import type { RequestHandler } from '@builder.io/qwik-city';

/**
 * OIDC Provider catch-all endpoint handler
 * Handles OpenID Connect discovery endpoint:
 * - /.well-known/openid_configuration
 * 
 * Other OIDC endpoints are handled by their specific route files:
 * - /auth -> /oidc/auth/index.ts
 * - /token -> /oidc/token/index.ts
 * - /userinfo -> /oidc/userinfo/index.ts
 * - /jwks -> /oidc/jwks/index.ts
 * - /revocation -> /oidc/revocation/index.ts
 * - /introspection -> /oidc/introspection/index.ts
 */
export const onRequest: RequestHandler = async (event) => {
  try {
    // Handle .well-known/openid_configuration endpoint
    if (event.url.pathname.endsWith('/.well-known/openid_configuration')) {
      const issuer = `${event.url.protocol}//${event.url.host}/oidc`;
      
      const config = {
        issuer,
        authorization_endpoint: `${issuer}/auth`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        revocation_endpoint: `${issuer}/revocation`,
        introspection_endpoint: `${issuer}/introspection`,
        response_types_supported: ['code', 'id_token', 'code id_token'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
        claims_supported: ['sub', 'name', 'email', 'picture', 'email_verified'],
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      };
      
      event.json(200, config);
      return;
    }

    // Return 404 for any other unhandled paths
    event.json(404, {
      error: 'not_found',
      error_description: 'OIDC endpoint not found',
      endpoint: event.url.pathname,
    });

  } catch (error) {
    console.error('OIDC Provider error:', error);
    
    event.json(500, {
      error: 'server_error',
      error_description: 'Internal server error occurred',
    });
  }
};

// Handle all HTTP methods
export const onGet = onRequest;
export const onPost = onRequest;
export const onPut = onRequest;
export const onDelete = onRequest;
export const onPatch = onRequest;
export const onHead = onRequest;
export const onOptions = onRequest;
import type { RequestHandler } from '@builder.io/qwik-city';

/**
 * OpenID Connect Discovery Document
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 * 
 * Accessible at: /oidc/openid_configuration
 * Note: In production, you should set up a redirect from /.well-known/openid_configuration
 */
export const onGet: RequestHandler = async (event) => {
  const issuer = `${event.url.protocol}//${event.url.host}/oidc`;
  
  const discoveryDocument = {
    issuer,
    authorization_endpoint: `${issuer}/auth`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/jwks`,
    revocation_endpoint: `${issuer}/revocation`,
    introspection_endpoint: `${issuer}/introspection`,
    
    // Supported response types
    response_types_supported: [
      'code',
      'id_token',
      'code id_token',
    ],
    
    // Supported subject types
    subject_types_supported: ['public'],
    
    // Supported signing algorithms
    id_token_signing_alg_values_supported: ['RS256'],
    
    // Supported scopes
    scopes_supported: [
      'openid',
      'profile',
      'email',
    ],
    
    // Supported claims
    claims_supported: [
      'sub',
      'name',
      'email',
      'email_verified',
      'picture',
      'aud',
      'exp',
      'iat',
      'iss',
    ],
    
    // Supported grant types
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
    ],
    
    // Token endpoint authentication methods
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_basic',
      'client_secret_post',
    ],
    
    // Code challenge methods (PKCE)
    code_challenge_methods_supported: ['S256'],
    
    // Additional OIDC features
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    require_request_uri_registration: false,
    
    // Service documentation
    service_documentation: `${issuer}/docs`,
    op_policy_uri: `${issuer}/policy`,
    op_tos_uri: `${issuer}/terms`,
  };

  event.json(200, discoveryDocument);
};
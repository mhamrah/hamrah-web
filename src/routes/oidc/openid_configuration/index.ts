import type { RequestHandler } from '@builder.io/qwik-city';

/**
 * OpenID Connect Discovery Document
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 * 
 * Alternative endpoint at: /oidc/openid_configuration
 * Primary endpoint is at: /.well-known/openid_configuration
 */
export const onGet: RequestHandler = async (event) => {
  const issuer = `${event.url.protocol}//${event.url.host}`;
  
  const discoveryDocument = {
    issuer,
    authorization_endpoint: `${issuer}/oidc/auth`,
    token_endpoint: `${issuer}/oidc/token`,
    userinfo_endpoint: `${issuer}/oidc/userinfo`,
    jwks_uri: `${issuer}/oidc/jwks`,
    revocation_endpoint: `${issuer}/oidc/revocation`,
    introspection_endpoint: `${issuer}/oidc/introspection`,
    
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
    service_documentation: `${issuer}/oidc/docs`,
    op_policy_uri: `${issuer}/oidc/policy`,
    op_tos_uri: `${issuer}/oidc/terms`,
  };

  event.json(200, discoveryDocument);
};
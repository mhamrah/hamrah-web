import type { RequestHandler } from '@builder.io/qwik-city';
import { createOIDCProvider } from '../../../lib/auth/oidc-config';

/**
 * OIDC Provider endpoint handler
 * Handles all OpenID Connect endpoints:
 * - /.well-known/openid_configuration
 * - /auth (authorization endpoint)
 * - /token (token endpoint)
 * - /userinfo (userinfo endpoint)
 * - /jwks (JSON Web Key Set)
 * - /revocation (token revocation)
 * - /introspection (token introspection)
 */
export const onRequest: RequestHandler = async (event) => {
  try {
    // Get the issuer URL (base URL for OIDC)
    const issuer = `${event.url.protocol}//${event.url.host}/oidc`;
    
    // Create OIDC provider instance
    const provider = await createOIDCProvider(issuer, event);

    // Handle the OIDC request
    const callback = provider.callback();
    
    // Create a response object that oidc-provider expects
    let responseStatus = 200;
    const responseHeaders = new Headers();
    let responseBody = '';

    const mockResponse = {
      headers: responseHeaders,
      
      // Header methods
      set(name: string, value: string) {
        responseHeaders.set(name, value);
      },
      
      get(name: string) {
        return responseHeaders.get(name);
      },
      
      // Body setter
      set body(content: any) {
        responseBody = content;
      },
      
      get body() {
        return responseBody;
      },

      // Status setter/getter
      set status(code: number) {
        responseStatus = code;
      },
      
      get status() {
        return responseStatus;
      },

      // Redirect method
      redirect(url: string) {
        responseStatus = 302;
        responseHeaders.set('Location', url);
      },
    };

    // Call the OIDC provider with the request and response
    await callback(event.request as any, mockResponse as any);

    // Return the response from OIDC provider
    return new Response(responseBody, {
      status: responseStatus,
      headers: responseHeaders,
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
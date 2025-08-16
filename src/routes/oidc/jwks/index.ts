import type { RequestHandler } from '@builder.io/qwik-city';
import { generateJWKS } from '../../../lib/auth/oidc-config';

/**
 * JSON Web Key Set (JWKS) endpoint
 * Provides public keys for JWT token verification
 */
export const onGet: RequestHandler = async (event) => {
  try {
    // Generate or retrieve JWKS
    const jwks = await generateJWKS();
    
    // Return only the public keys
    const publicJWKS = {
      keys: jwks.keys
    };

    // Set appropriate headers
    event.headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    event.headers.set('Content-Type', 'application/json');
    
    event.json(200, publicJWKS);
  } catch (error) {
    console.error('JWKS error:', error);
    
    event.json(500, {
      error: 'server_error',
      error_description: 'Failed to generate JWKS',
    });
  }
};
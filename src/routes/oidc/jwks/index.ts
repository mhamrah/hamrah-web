import type { RequestHandler } from '@builder.io/qwik-city';
import { getPublicJWKS } from '../../../lib/auth/key-manager';

/**
 * JSON Web Key Set (JWKS) endpoint
 * Provides public keys for JWT token verification
 */
export const onGet: RequestHandler = async (event) => {
  try {
    // Get public JWKS from key manager
    const publicJWKS = await getPublicJWKS(event);

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
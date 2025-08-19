import { Google, Apple } from "arctic";
import { jwtVerify, importJWK } from "jose";

export function getGoogleProvider(event: any) {
  const clientId =  event.platform.env.GOOGLE_CLIENT_ID;
  const clientSecret = event.platform.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${event.url.origin}/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new Google(clientId, clientSecret, redirectUri);
}

export function getAppleProvider(event: any) {
  const clientId = event.platform.env.APPLE_CLIENT_ID;
  const teamId = event.platform.env.APPLE_TEAM_ID;
  const keyId = event.platform.env.APPLE_KEY_ID;
  const certificate = event.platform.env.APPLE_CERTIFICATE; // Private key
  const redirectUri = `${event.url.origin}/auth/apple/callback`;

  if (!clientId || !teamId || !keyId || !certificate) {
    throw new Error("Apple OAuth credentials not configured");
  }

  // Convert PEM string to Uint8Array as required by Arctic
  // Remove PEM headers and decode base64 content
  const privateKeyBase64 = certificate
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll("\r", "")
    .replaceAll("\n", "")
    .trim();
  
  // Decode base64 to Uint8Array with proper error handling
  let privateKeyUint8Array: Uint8Array;
  try {
    privateKeyUint8Array = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));
  } catch (error) {
    throw new Error('Invalid Apple certificate format');
  }

  return new Apple(clientId, teamId, keyId, privateKeyUint8Array, redirectUri);
}

/**
 * Verify Google ID Token
 */
export async function verifyGoogleToken(idToken: string, event: any): Promise<{
  email: string;
  name?: string;
  picture?: string;
  providerId: string;
}> {
  try {
    // Google's public keys endpoint
    const jwksResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    const jwks = await jwksResponse.json();
    
    // Decode token header to get key ID
    const [headerB64] = idToken.split('.');
    const header = JSON.parse(atob(headerB64));
    const kid = header.kid;
    
    // Find the matching key
    const key = jwks.keys.find((k: any) => k.kid === kid);
    if (!key) {
      throw new Error('No matching key found for token');
    }
    
    // Import the JWK
    const publicKey = await importJWK(key);
    
    // Verify the token
    const { payload } = await jwtVerify(idToken, publicKey, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: event.platform.env.GOOGLE_CLIENT_ID,
    });
    
    if (!payload.email || typeof payload.email !== 'string') {
      throw new Error('No email found in Google token');
    }
    
    return {
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      providerId: typeof payload.sub === 'string' ? payload.sub : '',
    };
    
  } catch (error) {
    console.error('Google token verification failed:', error);
    throw new Error('Invalid Google token');
  }
}

/**
 * Verify Apple ID Token
 */
export async function verifyAppleToken(idToken: string, event: any): Promise<{
  email: string;
  name?: string;
  picture?: string;
  providerId: string;
}> {
  try {
    // Apple's public keys endpoint
    const jwksResponse = await fetch('https://appleid.apple.com/auth/keys');
    const jwks = await jwksResponse.json();
    
    // Decode token header to get key ID
    const [headerB64] = idToken.split('.');
    const header = JSON.parse(atob(headerB64));
    const kid = header.kid;
    
    // Find the matching key
    const key = jwks.keys.find((k: any) => k.kid === kid);
    if (!key) {
      throw new Error('No matching key found for token');
    }
    
    // Import the JWK
    const publicKey = await importJWK(key);
    
    // Verify the token
    const { payload } = await jwtVerify(idToken, publicKey, {
      issuer: 'https://appleid.apple.com',
      audience: event.platform.env.APPLE_CLIENT_ID,
    });
    
    if (!payload.email || typeof payload.email !== 'string') {
      throw new Error('No email found in Apple token');
    }
    
    return {
      email: payload.email,
      name: undefined, // Apple doesn't always provide name in token
      picture: undefined, // Apple doesn't provide picture
      providerId: typeof payload.sub === 'string' ? payload.sub : '',
    };
    
  } catch (error) {
    console.error('Apple token verification failed:', error);
    throw new Error('Invalid Apple token');
  }
}

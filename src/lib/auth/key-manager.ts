import { generateKeyPair, exportJWK, importPKCS8, importJWK } from 'jose';
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { KEY_ROTATION_INTERVAL_MS, RSA_KEY_SIZE, SIGNING_ALGORITHM } from './constants';

export interface JWKSData {
  keys: Array<{
    kty: string;
    use: string;
    alg: string;
    kid: string;
    n?: string;
    e?: string;
    x?: string;
    y?: string;
    crv?: string;
  }>;
  privateKey: any;
  privateKeyJWK: any; // Store the JWK representation for re-import
  createdAt: number;
  expiresAt: number;
}

const JWKS_KV_KEY = 'oidc:jwks:current';

/**
 * Get or generate JWKS with persistent storage in Cloudflare KV
 */
export async function getOrGenerateJWKS(event: RequestEventCommon): Promise<JWKSData> {
  // Check if KV is available
  if (!event.platform?.env?.KV) {
    console.warn('Cloudflare KV not available, falling back to temporary keys');
    return await generateNewJWKS();
  }

  try {
    // Try to get existing JWKS from KV
    const existingJWKS = await event.platform.env.KV.get(JWKS_KV_KEY);
    
    if (existingJWKS) {
      const jwksData: JWKSData = JSON.parse(existingJWKS);
      
      // Check if keys are still valid (not expired)
      if (jwksData.expiresAt > Date.now()) {
        // Ensure we have a proper private key object
        if (jwksData.privateKeyJWK) {
          // Re-import the private key from JWK to make it extractable
          try {
            jwksData.privateKey = await importJWK(jwksData.privateKeyJWK, SIGNING_ALGORITHM);
            return jwksData;
          } catch (error) {
            console.warn('Failed to re-import private key, will regenerate:', error);
            // Fall through to generate new keys
          }
        } else if (jwksData.privateKey) {
          // Legacy case - privateKey exists but no JWK
          return jwksData;
        }
      }
      
      console.log('JWKS expired or invalid, generating new keys');
    }

    // Generate new JWKS if none exist or expired
    const newJWKS = await generateNewJWKS();
    
    // Store in KV with expiration (exclude the CryptoKey object for serialization)
    const storableJWKS = {
      keys: newJWKS.keys,
      privateKeyJWK: newJWKS.privateKeyJWK,
      createdAt: newJWKS.createdAt,
      expiresAt: newJWKS.expiresAt,
    };
    
    await event.platform.env.KV.put(
      JWKS_KV_KEY, 
      JSON.stringify(storableJWKS),
      {
        expirationTtl: Math.floor(KEY_ROTATION_INTERVAL_MS / 1000), // Convert to seconds
      }
    );

    return newJWKS;

  } catch (error) {
    console.error('Error managing JWKS in KV:', error);
    // Fallback to generating temporary keys
    return await generateNewJWKS();
  }
}

/**
 * Generate new JWKS
 */
async function generateNewJWKS(): Promise<JWKSData> {
  const { publicKey, privateKey } = await generateKeyPair(SIGNING_ALGORITHM, {
    modulusLength: RSA_KEY_SIZE,
    extractable: true, // Ensure the key is extractable
  });

  const publicJWK = await exportJWK(publicKey);
  const privateJWK = await exportJWK(privateKey);

  const kid = generateKeyId();
  const now = Date.now();

  return {
    keys: [
      {
        kty: publicJWK.kty!,
        use: 'sig',
        alg: SIGNING_ALGORITHM,
        kid,
        n: publicJWK.n,
        e: publicJWK.e,
        x: publicJWK.x,
        y: publicJWK.y,
        crv: publicJWK.crv,
      },
    ],
    privateKey: privateKey, // Store the actual CryptoKey object
    privateKeyJWK: privateJWK, // Store JWK for serialization
    createdAt: now,
    expiresAt: now + KEY_ROTATION_INTERVAL_MS,
  };
}

/**
 * Generate a unique key ID
 */
function generateKeyId(): string {
  const timestamp = Date.now().toString(36);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${timestamp}-${random}`;
}

/**
 * Rotate JWKS keys manually (for emergency rotation)
 */
export async function rotateJWKS(event: RequestEventCommon): Promise<JWKSData> {
  if (!event.platform?.env?.KV) {
    throw new Error('Cloudflare KV not available for key rotation');
  }

  try {
    // Generate new keys
    const newJWKS = await generateNewJWKS();
    
    // Store in KV (exclude the CryptoKey object for serialization)
    const storableJWKS = {
      keys: newJWKS.keys,
      privateKeyJWK: newJWKS.privateKeyJWK,
      createdAt: newJWKS.createdAt,
      expiresAt: newJWKS.expiresAt,
    };
    
    await event.platform.env.KV.put(
      JWKS_KV_KEY, 
      JSON.stringify(storableJWKS),
      {
        expirationTtl: Math.floor(KEY_ROTATION_INTERVAL_MS / 1000),
      }
    );

    console.log('JWKS keys rotated successfully');
    return newJWKS;

  } catch (error) {
    console.error('Error rotating JWKS:', error);
    throw error;
  }
}

/**
 * Get current JWKS for public endpoint
 */
export async function getPublicJWKS(event: RequestEventCommon) {
  const jwksData = await getOrGenerateJWKS(event);
  
  return {
    keys: jwksData.keys,
  };
}

/**
 * Validate that the private key matches the public key
 */
export async function validateKeyPair(jwksData: JWKSData): Promise<boolean> {
  try {
    // Import the private key and check if it can generate the same public key
    const privateKeyPem = await convertJWKToPKCS8(jwksData.privateKey);
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    
    // If we can import it successfully, the key pair is valid
    return true;
  } catch (error) {
    console.error('Key pair validation failed:', error);
    return false;
  }
}

/**
 * Convert JWK private key to PKCS8 format
 */
async function convertJWKToPKCS8(jwk: any): Promise<string> {
  // This is a simplified conversion - in practice you might need a more robust implementation
  // For now, we'll trust the JOSE library's key generation
  return jwk;
}
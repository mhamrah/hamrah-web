import type { RequestHandler } from '@builder.io/qwik-city';
import { getClient, validateClientCredentials } from '../../../lib/auth/client-manager';
import { generateToken, hashToken } from '../../../lib/auth/tokens';
import { SignJWT, importJWK } from 'jose';
import { getDB, authTokens, users } from '../../../lib/db';
import { getOrGenerateJWKS } from '../../../lib/auth/key-manager';
import { validateAndConsumeAuthorizationCode } from '../../../lib/auth/authorization-codes';
import { eq } from 'drizzle-orm';
import { 
  ACCESS_TOKEN_LIFETIME_MS, 
  REFRESH_TOKEN_LIFETIME_MS, 
  ACCESS_TOKEN_LIFETIME_SECONDS,
  SIGNING_ALGORITHM 
} from '../../../lib/auth/constants';

/**
 * OAuth 2.0 Token Endpoint
 * Exchanges authorization code for access tokens
 */
export const onPost: RequestHandler = async (event) => {
  try {
    // Parse form data
    const formData = await event.request.formData();
    const grantType = formData.get('grant_type')?.toString();
    const clientId = formData.get('client_id')?.toString();
    const clientSecret = formData.get('client_secret')?.toString();
    const code = formData.get('code')?.toString();
    const redirectUri = formData.get('redirect_uri')?.toString();
    const codeVerifier = formData.get('code_verifier')?.toString();

    // Validate grant type
    if (grantType !== 'authorization_code') {
      event.json(400, {
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported',
      });
      return;
    }

    // Validate required parameters
    if (!clientId || !code || !redirectUri) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'Missing required parameters',
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

    // Validate authorization code
    const codeData = validateAndConsumeAuthorizationCode(code, clientId, redirectUri, codeVerifier);
    
    if (!codeData) {
      event.json(400, {
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      });
      return;
    }

    // Validate PKCE for native clients
    if (client.applicationType === 'native' && !codeVerifier) {
      event.json(400, {
        error: 'invalid_request',
        error_description: 'code_verifier required for native clients',
      });
      return;
    }

    // Get user from database using the user ID from the authorization code
    const db = getDB(event);
    const userResults = await db.select().from(users).where(eq(users.id, codeData.userId));
    
    if (userResults.length === 0) {
      event.json(400, {
        error: 'invalid_grant',
        error_description: 'User not found',
      });
      return;
    }
    
    const user = userResults[0];

    // Generate access token (JWT)
    const accessToken = await generateAccessToken(user, clientId, event);
    
    // Generate refresh token
    const refreshToken = generateToken();
    
    // Store tokens in database
    const tokenId = generateToken();
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS);
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS);

    await db.insert(authTokens).values({
      id: tokenId,
      userId: user.id,
      tokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      platform: 'ios',
      userAgent: event.request.headers.get('user-agent'),
      ipAddress: event.request.headers.get('cf-connecting-ip') || 
                event.request.headers.get('x-forwarded-for')?.split(',')[0] || 
                null,
      revoked: false,
      lastUsed: now,
      createdAt: now,
    });

    // Generate ID token
    const idToken = await generateIdToken(user, clientId, event);

    // Return tokens
    event.json(200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      refresh_token: refreshToken,
      id_token: idToken,
      scope: 'openid profile email',
    });

  } catch (error) {
    console.error('Token endpoint error:', error);
    
    event.json(500, {
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
};

/**
 * Generate JWT access token using persistent JWKS
 */
async function generateAccessToken(user: any, clientId: string, event: any): Promise<string> {
  // Use persistent JWKS for consistent signing
  const jwksData = await getOrGenerateJWKS(event);
  const privateKey = await importJWK(jwksData.privateKey, SIGNING_ALGORITHM);
  
  const issuer = `${event.url.protocol}//${event.url.host}/oidc`;
  const now = Math.floor(Date.now() / 1000);
  
  return await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    client_id: clientId,
    scope: 'openid profile email',
  })
    .setProtectedHeader({ alg: SIGNING_ALGORITHM, kid: jwksData.keys[0].kid })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_LIFETIME_SECONDS)
    .setIssuer(issuer)
    .setAudience(clientId)
    .sign(privateKey);
}

/**
 * Generate ID token using persistent JWKS
 */
async function generateIdToken(user: any, clientId: string, event: any): Promise<string> {
  // Use persistent JWKS for consistent signing
  const jwksData = await getOrGenerateJWKS(event);
  const privateKey = await importJWK(jwksData.privateKey, SIGNING_ALGORITHM);
  
  const issuer = `${event.url.protocol}//${event.url.host}/oidc`;
  const now = Math.floor(Date.now() / 1000);
  
  return await new SignJWT({
    sub: user.id,
    email: user.email,
    email_verified: true,
    name: user.name,
    picture: user.picture,
    aud: clientId,
    iss: issuer,
    iat: now,
    exp: now + ACCESS_TOKEN_LIFETIME_SECONDS,
    auth_time: now,
  })
    .setProtectedHeader({ alg: SIGNING_ALGORITHM, kid: jwksData.keys[0].kid })
    .sign(privateKey);
}
import type { RequestHandler } from '@builder.io/qwik-city';
import { getClient, validateClientCredentials } from '../../../lib/auth/client-manager';
import { generateToken, hashToken } from '../../../lib/auth/tokens';
import { generateKeyPair, SignJWT } from 'jose';
import { getDB, authTokens, users } from '../../../lib/db';

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

    // Validate PKCE for native clients
    if (client.applicationType === 'native') {
      if (!codeVerifier) {
        event.json(400, {
          error: 'invalid_request',
          error_description: 'code_verifier required for native clients',
        });
        return;
      }

      // In a real implementation, you would retrieve the stored code_challenge
      // and verify it against the code_verifier using SHA256
      // For now, we'll assume the code is valid
    }

    // In a real implementation, you would:
    // 1. Validate the authorization code
    // 2. Ensure it hasn't expired
    // 3. Verify it belongs to this client
    // 4. Get the user ID associated with the code
    
    // For demo purposes, we'll create tokens for the first user
    const db = getDB(event);
    const allUsers = await db.select().from(users).limit(1);
    const user = allUsers[0];
    
    if (!user) {
      event.json(400, {
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      });
      return;
    }

    // Generate access token (JWT)
    const accessToken = await generateAccessToken(user, clientId, event);
    
    // Generate refresh token
    const refreshToken = generateToken();
    
    // Store tokens in database
    const tokenId = generateToken();
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + 3600 * 1000); // 1 hour
    const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000); // 30 days

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
      expires_in: 3600,
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
 * Generate JWT access token
 */
async function generateAccessToken(user: any, clientId: string, event: any): Promise<string> {
  // Generate a key pair for signing (in production, use stored keys)
  const { privateKey } = await generateKeyPair('RS256');
  
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
    .setProtectedHeader({ alg: 'RS256', kid: 'main-signing-key' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(issuer)
    .setAudience(clientId)
    .sign(privateKey);
}

/**
 * Generate ID token
 */
async function generateIdToken(user: any, clientId: string, event: any): Promise<string> {
  // Generate a key pair for signing (in production, use stored keys)
  const { privateKey } = await generateKeyPair('RS256');
  
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
    exp: now + 3600,
    auth_time: now,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'main-signing-key' })
    .sign(privateKey);
}
// WebAuthn server-side implementation using SimpleWebAuthn
// Handles all WebAuthn operations and calls hamrah-api for persistence

import type { RequestEventCommon } from '@builder.io/qwik-city';
import { createApiClient, type WebAuthnCredential as ApiWebAuthnCredential } from '~/lib/auth/api-client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  PublicKeyCredentialDescriptorFuture,
  RegistrationResponseJSON,
  VerifyAuthenticationResponseOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';

// WebAuthn configuration
const WEBAUTHN_CONFIG = {
  rpName: 'Hamrah',
  rpID: (hostname: string): string => {
    // For development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'localhost';
    }
    // For production - use the actual hostname
    return hostname;
  },
  origin: (event: RequestEventCommon): string => {
    const hostname = event.url.hostname;
    const protocol = event.url.protocol;
    
    // For development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:${event.url.port || '5173'}`;
    }
    
    // For production
    return `${protocol}//${hostname}`;
  },
  timeout: 60000, // 1 minute
  challengeTimeout: 300000, // 5 minutes
};

// Types for WebAuthn credential storage in database
interface DetailedWebAuthnCredential {
  id: string;
  user_id: string;
  public_key: Uint8Array;
  counter: number;
  transports?: string[];
  aaguid?: Uint8Array;
  credential_type: string;
  user_verified: boolean;
  credential_device_type?: string;
  credential_backed_up: boolean;
  name?: string;
  last_used?: number;
  created_at: number;
}

interface WebAuthnChallenge {
  id: string;
  challenge: string;
  user_id?: string;
  challenge_type: 'registration' | 'authentication';
  expires_at: number;
  created_at: number;
}

// Challenge storage in memory (temporary until we add session storage)
const challenges = new Map<string, { challenge: string; expires_at: number; user_id?: string; type: 'registration' | 'authentication' }>();

// Cleanup expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of challenges.entries()) {
    if (data.expires_at < now) {
      challenges.delete(id);
    }
  }
}, 60000); // Clean up every minute

/**
 * Generate WebAuthn registration options for a new user
 */
export async function generateWebAuthnRegistrationOptions(
  event: RequestEventCommon,
  user: { id: string; email: string; name?: string }
): Promise<{ options: any; challengeId: string }> {
  const hostname = event.url.hostname;
  const rpID = WEBAUTHN_CONFIG.rpID(hostname);
  const origin = WEBAUTHN_CONFIG.origin(event);

  // Get existing credentials to exclude them
  const api = createApiClient(event);
  let existingCredentials: ApiWebAuthnCredential[] = [];
  
  try {
    // Try to get existing credentials, but don't fail if none exist
    const credentialsResponse = await api.getWebAuthnCredentials(user.id);
    existingCredentials = credentialsResponse.credentials || [];
  } catch (error) {
    // User might not have credentials yet, which is fine
    console.warn('Could not fetch existing credentials:', error);
  }

  const excludeCredentials = existingCredentials.map(cred => ({
    id: cred.id,
    type: 'public-key' as const,
    transports: [] as AuthenticatorTransportFuture[], // API credentials don't include transports
  }));

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: WEBAUTHN_CONFIG.rpName,
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.name || user.email,
    timeout: WEBAUTHN_CONFIG.timeout,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
  };

  const options = await generateRegistrationOptions(opts);
  
  // Store challenge temporarily
  const challengeId = crypto.randomUUID();
  challenges.set(challengeId, {
    challenge: options.challenge,
    expires_at: Date.now() + WEBAUTHN_CONFIG.challengeTimeout,
    user_id: user.id,
    type: 'registration',
  });

  return {
    options,
    challengeId,
  };
}

/**
 * Verify WebAuthn registration response
 */
export async function verifyWebAuthnRegistration(
  event: RequestEventCommon,
  response: RegistrationResponseJSON,
  challengeId: string,
  user: { id: string; email: string; name?: string }
): Promise<{ verified: boolean; credentialId?: string; user?: any }> {
  const challengeData = challenges.get(challengeId);
  if (!challengeData || challengeData.type !== 'registration') {
    throw new Error('Invalid or expired challenge');
  }

  if (challengeData.expires_at < Date.now()) {
    challenges.delete(challengeId);
    throw new Error('Challenge expired');
  }

  const hostname = event.url.hostname;
  const rpID = WEBAUTHN_CONFIG.rpID(hostname);
  const expectedOrigin = WEBAUTHN_CONFIG.origin(event);

  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge: challengeData.challenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
  };

  const verification = await verifyRegistrationResponse(opts);
  
  // Clean up challenge
  challenges.delete(challengeId);

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false };
  }

  const { registrationInfo } = verification;
  
  // Store credential in database via API
  const api = createApiClient(event);
  const credentialData = {
    id: Buffer.from(registrationInfo.credential.id).toString('base64url'),
    user_id: user.id,
    public_key: registrationInfo.credential.publicKey,
    counter: registrationInfo.credential.counter,
    transports: response.response.transports,
    aaguid: typeof registrationInfo.aaguid === 'string' 
      ? new Uint8Array(Buffer.from(registrationInfo.aaguid, 'hex'))
      : new Uint8Array(registrationInfo.aaguid),
    credential_type: 'public-key',
    user_verified: registrationInfo.userVerified,
    credential_device_type: registrationInfo.credentialDeviceType,
    credential_backed_up: registrationInfo.credentialBackedUp,
  };

  await api.storeWebAuthnCredential(credentialData);

  return {
    verified: true,
    credentialId: Buffer.from(registrationInfo.credential.id).toString('base64url'),
    user,
  };
}

/**
 * Generate WebAuthn authentication options
 */
export async function generateWebAuthnAuthenticationOptions(
  event: RequestEventCommon,
  email?: string
): Promise<{ options: any; challengeId: string }> {
  const hostname = event.url.hostname;
  const rpID = WEBAUTHN_CONFIG.rpID(hostname);

  // Get user credentials if email provided
  let allowCredentials: { id: string; type?: 'public-key'; transports?: AuthenticatorTransportFuture[]; }[] | undefined;
  let userId: string | undefined;

  if (email) {
    const api = createApiClient(event);
    try {
      const user = await api.getUserByEmail({ email });
      if (user) {
        userId = user.id;
        const credentialsResponse = await api.getWebAuthnCredentials(user.id);
        const credentials = credentialsResponse.credentials || [];
        
        allowCredentials = credentials.map(cred => ({
          id: cred.id,
          type: 'public-key' as const,
        }));
      }
    } catch (error) {
      // User not found or no credentials - allow resident key authentication
      console.warn('Could not fetch user or credentials for authentication:', error);
    }
  }

  const opts: GenerateAuthenticationOptionsOpts = {
    rpID,
    timeout: WEBAUTHN_CONFIG.timeout,
    allowCredentials,
    userVerification: 'preferred',
  };

  const options = await generateAuthenticationOptions(opts);
  
  // Store challenge temporarily
  const challengeId = crypto.randomUUID();
  challenges.set(challengeId, {
    challenge: options.challenge,
    expires_at: Date.now() + WEBAUTHN_CONFIG.challengeTimeout,
    user_id: userId,
    type: 'authentication',
  });

  return {
    options,
    challengeId,
  };
}

/**
 * Verify WebAuthn authentication response
 */
export async function verifyWebAuthnAuthentication(
  event: RequestEventCommon,
  response: AuthenticationResponseJSON,
  challengeId: string
): Promise<{ verified: boolean; user?: any; credentialId?: string }> {
  const challengeData = challenges.get(challengeId);
  if (!challengeData || challengeData.type !== 'authentication') {
    throw new Error('Invalid or expired challenge');
  }

  if (challengeData.expires_at < Date.now()) {
    challenges.delete(challengeId);
    throw new Error('Challenge expired');
  }

  // Find the credential in database
  const api = createApiClient(event);
  const credential = await api.getWebAuthnCredentialById(response.id);
  
  if (!credential) {
    challenges.delete(challengeId);
    throw new Error('Credential not found');
  }

  // Get user
  const user = await api.getUserById({ userId: credential.user_id });
  if (!user) {
    challenges.delete(challengeId);
    throw new Error('User not found');
  }

  const hostname = event.url.hostname;
  const rpID = WEBAUTHN_CONFIG.rpID(hostname);
  const expectedOrigin = WEBAUTHN_CONFIG.origin(event);

  const opts: VerifyAuthenticationResponseOpts = {
    response,
    expectedChallenge: challengeData.challenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credential.id,  // Keep as string for SimpleWebAuthn
      publicKey: credential.public_key,
      counter: credential.counter,
    },
  };

  const verification = await verifyAuthenticationResponse(opts);
  
  // Clean up challenge
  challenges.delete(challengeId);

  if (!verification.verified || !verification.authenticationInfo) {
    return { verified: false };
  }

  // Update credential counter and last used
  await api.updateWebAuthnCredentialCounter(credential.id, {
    counter: verification.authenticationInfo.newCounter,
    last_used: Date.now(),
  });

  return {
    verified: true,
    user,
    credentialId: credential.id,
  };
}

/**
 * Get user's WebAuthn credentials
 */
export async function getUserWebAuthnCredentials(
  event: RequestEventCommon,
  userId: string
): Promise<ApiWebAuthnCredential[]> {
  const api = createApiClient(event);
  const response = await api.getWebAuthnCredentials(userId);
  return response.credentials || [];
}

/**
 * Delete a WebAuthn credential
 */
export async function deleteWebAuthnCredential(
  event: RequestEventCommon,
  credentialId: string
): Promise<boolean> {
  const api = createApiClient(event);
  return await api.deleteWebAuthnCredential(credentialId);
}

/**
 * Update WebAuthn credential name
 */
export async function updateWebAuthnCredentialName(
  event: RequestEventCommon,
  credentialId: string,
  name: string
): Promise<boolean> {
  const api = createApiClient(event);
  return await api.updateWebAuthnCredentialName(credentialId, name);
}
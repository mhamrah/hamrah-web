import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import { eq, and } from "drizzle-orm";
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { 
  getDB, 
  webauthnCredentials, 
  webauthnChallenges, 
  users,
  type User,
  type WebAuthnCredential,
  type NewWebAuthnCredential,
  type WebAuthnChallenge,
  type NewWebAuthnChallenge 
} from "../db";
import { generateSessionToken, createSession } from "./session";
import { generateRandomId } from "./utils";

// Configuration
const rpName = 'Hamrah App';

function getRpConfig(event: RequestEventCommon) {
  const hostname = event.url.hostname;
  const protocol = event.url.protocol;
  
  // For development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return {
      rpID: 'localhost',
      origin: `${protocol}//${hostname}:${event.url.port || '5173'}`
    };
  }
  
  // For production - use the actual hostname from the request
  return {
    rpID: hostname,
    origin: `${protocol}//${hostname}`
  };
}

/**
 * Generate WebAuthn registration options for a user
 */
export async function generateWebAuthnRegistrationOptions(
  event: RequestEventCommon, 
  user: User
): Promise<ReturnType<typeof generateRegistrationOptions> & { challengeId: string }> {
  const db = getDB(event);
  const { rpID } = getRpConfig(event);
  
  // Get existing credentials for excludeCredentials
  const existingCredentials = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, user.id));

  const opts: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name ?? undefined,
    timeout: 60000,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map(cred => ({
      id: cred.id,
      transports: cred.transports ? JSON.parse(cred.transports) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
  };

  const options = await generateRegistrationOptions(opts);

  // Store challenge in database
  const challengeId = generateRandomId();
  const challengeRecord: NewWebAuthnChallenge = {
    id: challengeId,
    challenge: options.challenge,
    userId: user.id,
    type: 'registration',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    createdAt: new Date(),
  };

  await db.insert(webauthnChallenges).values(challengeRecord);

  return Object.assign(options, { challengeId });
}

/**
 * Generate WebAuthn registration options for new users (no existing user account)
 */
export async function generateWebAuthnRegistrationOptionsForNewUser(
  event: RequestEventCommon,
  email: string,
  name: string
): Promise<ReturnType<typeof generateRegistrationOptions> & { challengeId: string }> {
  const db = getDB(event);
  const { rpID } = getRpConfig(event);

  const opts: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID,
    userName: email,
    userDisplayName: name,
    timeout: 60000,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
    supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
  };

  const options = await generateRegistrationOptions(opts);

  // Store challenge in database (without userId for new registrations)
  const challengeId = generateRandomId();
  const challengeRecord: NewWebAuthnChallenge = {
    id: challengeId,
    challenge: options.challenge,
    userId: null, // No user yet
    type: 'registration',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    createdAt: new Date(),
  };

  await db.insert(webauthnChallenges).values(challengeRecord);

  return Object.assign(options, { challengeId });
}

/**
 * Verify WebAuthn registration response
 */
export async function verifyWebAuthnRegistration(
  event: RequestEventCommon,
  response: RegistrationResponseJSON,
  challengeId: string,
  user?: User
): Promise<{ verified: boolean; user?: User; credentialId?: string }> {
  const db = getDB(event);
  
  // Get and verify challenge
  const challengeRecord = await db
    .select()
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.id, challengeId))
    .limit(1);

  if (challengeRecord.length === 0) {
    throw new Error('Challenge not found');
  }

  const challenge = challengeRecord[0];
  
  if (challenge.expiresAt.getTime() < Date.now()) {
    // Clean up expired challenge
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId));
    throw new Error('Challenge expired');
  }

  if (challenge.type !== 'registration') {
    throw new Error('Invalid challenge type');
  }

  const { rpID, origin } = getRpConfig(event);
  
  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  };
  

  try {
    const verification = await verifyRegistrationResponse(opts);
    
    if (!verification.verified || !verification.registrationInfo) {
      return { verified: false };
    }

    // Access credential properties based on the new API structure
    const registrationInfo = verification.registrationInfo as any;
    const credentialID = registrationInfo.credentialID || registrationInfo.credential?.id;
    const credentialPublicKey = registrationInfo.credentialPublicKey || registrationInfo.credential?.publicKey;
    const counter = registrationInfo.counter || 0;
    const credentialDeviceType = registrationInfo.credentialDeviceType;
    const credentialBackedUp = registrationInfo.credentialBackedUp;
    
    // Check for required fields
    if (!credentialID) {
      return { verified: false };
    }
    
    if (!credentialPublicKey) {
      return { verified: false };
    }

    // Store credential in database
    let credentialIdString: string;
    let publicKeyString: string;
    
    try {
      credentialIdString = typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url');
      publicKeyString = Buffer.from(credentialPublicKey).toString('base64url');
    } catch (error) {
      return { verified: false };
    }
    
    const credentialRecord: NewWebAuthnCredential = {
      id: credentialIdString,
      userId: user?.id || challenge.userId || '',
      publicKey: publicKeyString,
      counter,
      transports: response.response.transports ? JSON.stringify(response.response.transports) : null,
      aaguid: verification.registrationInfo.aaguid,
      credentialType: 'public-key',
      userVerified: verification.registrationInfo.userVerified,
      credentialDeviceType,
      credentialBackedUp,
      name: null, // Will be set by user later
      lastUsed: null,
      createdAt: new Date(),
    };

    await db.insert(webauthnCredentials).values(credentialRecord);

    // Clean up challenge
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId));

    return { 
      verified: true, 
      user: user || (challenge.userId ? await getUserById(event, challenge.userId) : undefined),
      credentialId: credentialID 
    };
  } catch (error) {
    return { verified: false };
  }
}

/**
 * Generate WebAuthn authentication options
 */
export async function generateWebAuthnAuthenticationOptions(
  event: RequestEventCommon,
  email?: string
): Promise<ReturnType<typeof generateAuthenticationOptions> & { challengeId: string }> {
  const db = getDB(event);
  const { rpID } = getRpConfig(event);
  
  let allowCredentials;
  
  if (email) {
    // Get user's credentials if email provided
    const userResult = await db
      .select({ user: users, credential: webauthnCredentials })
      .from(users)
      .leftJoin(webauthnCredentials, eq(webauthnCredentials.userId, users.id))
      .where(eq(users.email, email));

    if (userResult.length > 0) {
      allowCredentials = userResult
        .filter(r => r.credential)
        .map(r => ({
          id: r.credential!.id,
          transports: r.credential!.transports ? JSON.parse(r.credential!.transports) : undefined,
        }));
      
      // If user exists but has no credentials, throw an error to indicate registration is needed
      if (allowCredentials.length === 0) {
        throw new Error('User exists but has no passkeys registered. Registration required.');
      }
    } else {
      // User doesn't exist, throw an error to indicate registration is needed
      throw new Error('User not found. Registration required.');
    }
  } else {
    // No email provided, try to get all credentials for resident key authentication
    const allCredentials = await db
      .select()
      .from(webauthnCredentials);
    
    if (allCredentials.length === 0) {
      throw new Error('No credentials found. Registration required.');
    }
    
    allowCredentials = allCredentials.map(cred => ({
      id: cred.id,
      transports: cred.transports ? JSON.parse(cred.transports) : undefined,
    }));
  }

  const opts: GenerateAuthenticationOptionsOpts = {
    rpID,
    timeout: 60000,
    allowCredentials,
    userVerification: 'preferred',
  };

  const options = await generateAuthenticationOptions(opts);

  // Store challenge
  const challengeId = generateRandomId();
  const challengeRecord: NewWebAuthnChallenge = {
    id: challengeId,
    challenge: options.challenge,
    userId: null, // Don't know user yet
    type: 'authentication',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    createdAt: new Date(),
  };

  await db.insert(webauthnChallenges).values(challengeRecord);

  return Object.assign(options, { challengeId });
}

/**
 * Verify WebAuthn authentication response
 */
export async function verifyWebAuthnAuthentication(
  event: RequestEventCommon,
  response: AuthenticationResponseJSON,
  challengeId: string
): Promise<{ verified: boolean; user?: User; sessionToken?: string }> {
  const db = getDB(event);
  
  // Get challenge
  const challengeRecord = await db
    .select()
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.id, challengeId))
    .limit(1);

  if (challengeRecord.length === 0) {
    throw new Error('Challenge not found');
  }

  const challenge = challengeRecord[0];
  
  if (challenge.expiresAt.getTime() < Date.now()) {
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId));
    throw new Error('Challenge expired');
  }

  if (challenge.type !== 'authentication') {
    throw new Error('Invalid challenge type');
  }

  // Get credential
  const credentialRecord = await db
    .select({ credential: webauthnCredentials, user: users })
    .from(webauthnCredentials)
    .innerJoin(users, eq(webauthnCredentials.userId, users.id))
    .where(eq(webauthnCredentials.id, response.id))
    .limit(1);

  if (credentialRecord.length === 0) {
    return { verified: false };
  }

  const { credential, user } = credentialRecord[0];

  const { rpID, origin } = getRpConfig(event);
  
  const opts: VerifyAuthenticationResponseOpts = {
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey, 'base64url'),
      counter: credential.counter,
      transports: credential.transports ? JSON.parse(credential.transports) : undefined,
    },
    requireUserVerification: false,
  };

  try {
    const verification = await verifyAuthenticationResponse(opts);
    
    if (!verification.verified) {
      return { verified: false };
    }

    // Update credential counter and last used
    await db
      .update(webauthnCredentials)
      .set({ 
        counter: verification.authenticationInfo.newCounter,
        lastUsed: new Date(),
      })
      .where(eq(webauthnCredentials.id, credential.id));

    // Clean up challenge
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId));

    // Create session
    const sessionToken = generateSessionToken();
    await createSession(event, sessionToken, user.id);

    return { 
      verified: true, 
      user,
      sessionToken 
    };
  } catch (error) {
    return { verified: false };
  }
}

/**
 * Get user credentials for management
 */
export async function getUserWebAuthnCredentials(
  event: RequestEventCommon,
  userId: string
): Promise<WebAuthnCredential[]> {
  const db = getDB(event);
  
  return await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId));
}

/**
 * Delete a WebAuthn credential
 */
export async function deleteWebAuthnCredential(
  event: RequestEventCommon,
  credentialId: string,
  userId: string
): Promise<boolean> {
  const db = getDB(event);
  
  const result = await db
    .delete(webauthnCredentials)
    .where(
      and(
        eq(webauthnCredentials.id, credentialId),
        eq(webauthnCredentials.userId, userId)
      )
    );

  return result.meta.changes > 0;
}

/**
 * Update credential name
 */
export async function updateWebAuthnCredentialName(
  event: RequestEventCommon,
  credentialId: string,
  userId: string,
  name: string
): Promise<boolean> {
  const db = getDB(event);
  
  const result = await db
    .update(webauthnCredentials)
    .set({ name })
    .where(
      and(
        eq(webauthnCredentials.id, credentialId),
        eq(webauthnCredentials.userId, userId)
      )
    );

  return result.meta.changes > 0;
}

/**
 * Clean up expired challenges
 */
export async function cleanupExpiredChallenges(event: RequestEventCommon): Promise<void> {
  const db = getDB(event);
  
  await db
    .delete(webauthnChallenges)
    .where(eq(webauthnChallenges.expiresAt, new Date(Date.now())));
}

/**
 * Helper function to get user by ID
 */
async function getUserById(event: RequestEventCommon, userId: string): Promise<User | undefined> {
  const db = getDB(event);
  
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}
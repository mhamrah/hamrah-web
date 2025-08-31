// WebAuthn operations using hamrah-api client (api.hamrah.app)
// All direct DB access and local DB types have been removed.
// TODO: Migrate any remaining logic to hamrah-api endpoints as needed.

import type { RequestEventCommon } from '@builder.io/qwik-city';
import { createApiClient } from './api-client';

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
 * Delegates to hamrah-api
 */
export async function generateWebAuthnRegistrationOptions(
  event: RequestEventCommon,
  user: { id: string; email: string; name?: string }
): Promise<any> {
  const api = createApiClient(event);
  // Call hamrah-api endpoint to get registration options for existing user
  return await api.getWebAuthnRegistrationOptionsForExistingUser({
    userId: user.id,
    email: user.email,
    name: user.name,
  });
}

/**
 * Generate WebAuthn registration options for new users (no existing user account)
 * Delegates to hamrah-api
 */
export async function generateWebAuthnRegistrationOptionsForNewUser(
  event: RequestEventCommon,
  email: string,
  name: string
): Promise<any> {
  const api = createApiClient(event);
  // Call hamrah-api endpoint to get registration options for new user
  return await api.getWebAuthnRegistrationOptionsForNewUser({
    email,
    name,
  });
}

/**
 * Verify WebAuthn registration response
 * Delegates to hamrah-api
 */
export async function verifyWebAuthnRegistration(
  event: RequestEventCommon,
  response: any,
  challengeId: string,
  user?: { id: string }
): Promise<{ verified: boolean; user?: any; credentialId?: string }> {
  const api = createApiClient(event);
  // Call hamrah-api endpoint to verify registration response
  return await api.verifyWebAuthnRegistration({
    response,
    challengeId,
    userId: user?.id,
  });
}

/**
 * Generate WebAuthn authentication options
 * Delegates to hamrah-api
 */
export async function generateWebAuthnAuthenticationOptions(
  event: RequestEventCommon,
  email?: string
): Promise<any> {
  const api = createApiClient(event);
  // Call hamrah-api endpoint to get authentication options
  return await api.getWebAuthnAuthenticationOptions({
    email,
  });
}

/**
 * Verify WebAuthn authentication response
 * Delegates to hamrah-api
 */
export async function verifyWebAuthnAuthentication(
  event: RequestEventCommon,
  response: any,
  challengeId: string
): Promise<{ verified: boolean; user?: any; sessionToken?: string }> {
  const api = createApiClient(event);
  // Call hamrah-api endpoint to verify authentication response
  return await api.verifyWebAuthnAuthentication({
    response,
    challengeId,
  });
}

/**
 * Get user credentials for management
 * Delegates to hamrah-api
 */
export async function getUserWebAuthnCredentials(
  event: RequestEventCommon
): Promise<any[]> {
  const api = createApiClient(event);
  return await api.listWebAuthnCredentials();
}

/**
 * Delete a WebAuthn credential
 * Delegates to hamrah-api
 */
export async function deleteWebAuthnCredential(
  event: RequestEventCommon,
  credentialId: string
): Promise<boolean> {
  const api = createApiClient(event);
  return await api.deleteWebAuthnCredential(credentialId);
}

/**
 * Update credential name
 * Delegates to hamrah-api
 */
export async function updateWebAuthnCredentialName(
  event: RequestEventCommon,
  credentialId: string,
  name: string
): Promise<boolean> {
  const api = createApiClient(event);
  return await api.updateWebAuthnCredentialName(credentialId, name);
}

/**
 * Clean up expired challenges
 * Note: This is handled automatically by hamrah-api, no explicit cleanup needed
 */
export async function cleanupExpiredChallenges(event: RequestEventCommon): Promise<void> {
  // No-op: Challenge cleanup is handled automatically by hamrah-api
}

/**
 * Helper function to get user by ID
 * Delegates to hamrah-api
 */
export async function getUserById(event: RequestEventCommon, userId: string): Promise<any | undefined> {
  const api = createApiClient(event);
  return await api.getUserById({ userId });
}

// TODO: Ensure all above methods are implemented in hamrah-api and update the API client accordingly.
// TODO: Remove any remaining references to local DB types or logic as hamrah-api endpoints are completed.

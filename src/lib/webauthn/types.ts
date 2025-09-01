/**
 * Consolidated WebAuthn types for the application.
 * This file contains all WebAuthn-related types to avoid duplication and ensure consistency.
 */

import type { RequestEventCommon } from '@builder.io/qwik-city';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';

// API WebAuthn credential (what we store/retrieve from database)
export interface ApiWebAuthnCredential {
  id: string;
  name?: string | null;
  created_at: string;
  last_used?: string | null;
}

// Detailed WebAuthn credential for server-side operations
export interface DetailedWebAuthnCredential {
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

// WebAuthn challenge storage
export interface WebAuthnChallenge {
  id: string;
  challenge: string;
  user_id?: string;
  challenge_type: 'registration' | 'authentication';
  expires_at: number;
  created_at: number;
}

// WebAuthn API response types
export interface WebAuthnBeginResponse {
  success: boolean;
  options: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
  challengeId?: string;
  error?: string;
}

export interface WebAuthnCompleteResponse {
  success: boolean;
  user?: any;
  error?: string;
}

// WebAuthn credential for API client operations  
export interface WebAuthnCredentialForStorage {
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
}

// WebAuthn credential returned from API
export interface WebAuthnCredentialFromApi {
  id: string;
  user_id: string;
  public_key: Uint8Array;
  counter: number;
  transports?: string[];
  aaguid?: Uint8Array;
}

// WebAuthn configuration
export interface WebAuthnConfig {
  rpName: string;
  rpID: (hostname: string) => string;
  origin: (event: RequestEventCommon) => string;
  timeout: number;
  challengeTimeout: number;
}

// Export re-exported SimpleWebAuthn types for convenience
export type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
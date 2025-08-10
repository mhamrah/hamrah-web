import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64urlNoPadding } from "@oslojs/encoding";

/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth flows
 * RFC 7636: https://tools.ietf.org/html/rfc7636
 */

export interface PKCECodePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

/**
 * Generate a cryptographically secure code verifier
 * Must be between 43-128 characters using [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32); // 32 bytes = 43 characters when base64url encoded
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}

/**
 * Generate code challenge from code verifier using S256 method
 * code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = sha256(data);
  return encodeBase64urlNoPadding(hash);
}

/**
 * Generate a complete PKCE code pair
 */
export function generatePKCECodePair(): PKCECodePair {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

/**
 * Verify that a code verifier matches the expected code challenge
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  expectedCodeChallenge: string
): boolean {
  const actualCodeChallenge = generateCodeChallenge(codeVerifier);
  return actualCodeChallenge === expectedCodeChallenge;
}

/**
 * Generate OAuth state parameter with CSRF protection
 */
export function generateOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}

/**
 * Create OAuth authorization URL with PKCE parameters
 */
export function createAuthorizationURL(
  baseURL: string,
  clientId: string,
  redirectURI: string,
  scopes: string[],
  pkce: PKCECodePair,
  state: string,
  additionalParams?: Record<string, string>
): URL {
  const url = new URL(baseURL);
  
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectURI);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.codeChallenge);
  url.searchParams.set("code_challenge_method", pkce.codeChallengeMethod);
  
  // Add any additional provider-specific parameters
  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      url.searchParams.set(key, value);
    }
  }
  
  return url;
}

/**
 * Extract and validate OAuth callback parameters
 */
export interface OAuthCallbackParams {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export function parseCallbackParams(
  searchParams: URLSearchParams
): OAuthCallbackParams | null {
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  
  if (error) {
    return {
      code: "",
      state: state || "",
      error,
      errorDescription: errorDescription || undefined,
    };
  }
  
  if (!code || !state) {
    return null;
  }
  
  return {
    code,
    state,
  };
}

/**
 * Validate OAuth state parameter against stored value
 */
export function validateOAuthState(
  receivedState: string,
  storedState: string
): boolean {
  if (!receivedState || !storedState) {
    return false;
  }
  
  // Use constant-time comparison to prevent timing attacks
  if (receivedState.length !== storedState.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < receivedState.length; i++) {
    result |= receivedState.charCodeAt(i) ^ storedState.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Generate nonce for OpenID Connect flows
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64urlNoPadding(bytes);
}
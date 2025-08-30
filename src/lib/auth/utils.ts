import type { RequestEventCommon } from '@builder.io/qwik-city';
import { validateSessionToken, type SessionValidationResult } from './session';

export async function getCurrentUser(event: RequestEventCommon): Promise<SessionValidationResult> {
  const sessionToken = event.cookie.get("session")?.value;
  
  if (!sessionToken) {
    return { session: null, user: null, isValid: false };
  }
  
  const result = await validateSessionToken(event, sessionToken);
  // Add isValid property based on API response
  return {
    ...result,
    isValid: result.success || false,
    session: result.session || null,
    user: result.user || null,
  };
}

export function generateUserId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateRandomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
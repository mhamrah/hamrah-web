import type { RequestEventCommon } from '@builder.io/qwik-city';
import { validateSessionToken, type SessionValidationResult } from './session';

export async function getCurrentUser(event: RequestEventCommon): Promise<SessionValidationResult> {
  const sessionToken = event.cookie.get("session")?.value;
  
  if (!sessionToken) {
    return { session: null, user: null };
  }
  
  return await validateSessionToken(event, sessionToken);
}

export function generateUserId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
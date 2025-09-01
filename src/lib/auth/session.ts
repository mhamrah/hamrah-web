import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { createApiClient } from "./api-client";
import { createInternalApiClient } from "./internal-api-client";

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const token = encodeBase32LowerCaseNoPadding(bytes);
  return token;
}

export function createSessionId(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(event: RequestEventCommon, token: string, userId: string) {
  // Session creation via internal service binding (only for server$ functions)
  const internalApiClient = createInternalApiClient(event);
  return await internalApiClient.createSession({
    user_id: userId,
    platform: "web",
  });
}

export async function validateSessionToken(event: RequestEventCommon, token: string): Promise<SessionValidationResult> {
  // Session validation via public cookie-based endpoint
  const apiClient = createApiClient(event);
  const result = await apiClient.validateSession();
  
  // Convert ApiAuthResponse to SessionValidationResult
  return {
    success: result.success,
    isValid: result.success,
    user: result.user,
    session: token ? { token, expiresAt: new Date() } : null,
  };
}

export function setSessionTokenCookie(event: RequestEventCommon, token: string, expiresAt: Date): void {
  event.cookie.set("session", token, {
    expires: expiresAt,
    sameSite: "lax",
    httpOnly: true,
    secure: true,
    path: "/",
  });
}

export function deleteSessionTokenCookie(event: RequestEventCommon): void {
  event.cookie.delete("session", { path: "/" });
}

export function invalidateSession(event: any, sessionId: string): any {
  throw new Error("invalidateSession has been moved to hamrah-api");
}

export interface SessionValidationResult {
  success: boolean;
  user?: any;
  session?: { token: string; expiresAt: Date } | null;
  isValid: boolean;
}
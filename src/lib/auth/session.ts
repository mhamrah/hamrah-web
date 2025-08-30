import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { createApiClient } from "./api-client";

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
  // Session creation is now handled via API
  const apiClient = createApiClient(event);
  return await apiClient.createSession({
    user_id: userId,
    platform: "web",
  });
}

export async function validateSessionToken(event: RequestEventCommon, token: string) {
  // Session validation is now handled via API
  const apiClient = createApiClient(event);
  return await apiClient.validateSession({
    session_token: token,
  });
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
  session: any;
  user: any;
  isValid: boolean;
}
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import { eq } from "drizzle-orm";
import type { RequestEventCommon } from '@builder.io/qwik-city';
import { getDB, sessions, users, type User, type Session } from "../db";

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const token = encodeBase32LowerCaseNoPadding(bytes);
  return token;
}

export function createSessionId(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(event: RequestEventCommon, token: string, userId: string): Promise<Session> {
  const sessionId = createSessionId(token);
  const session: Session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
    createdAt: new Date(),
  };
  
  const db = getDB(event);
  await db.insert(sessions).values(session);
  return session;
}

export async function validateSessionToken(event: RequestEventCommon, token: string): Promise<SessionValidationResult> {
  const sessionId = createSessionId(token);
  const db = getDB(event);
  
  const result = await db
    .select({
      user: users,
      session: sessions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));

  if (result.length < 1) {
    return { session: null, user: null };
  }
  
  const { user, session } = result[0];
  
  if (Date.now() >= session.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return { session: null, user: null };
  }
  
  if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    // Extend session if it expires in less than 15 days
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await db
      .update(sessions)
      .set({ expiresAt: session.expiresAt })
      .where(eq(sessions.id, sessionId));
  }
  
  return { session, user };
}

export async function invalidateSession(event: RequestEventCommon, sessionId: string): Promise<void> {
  const db = getDB(event);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function setSessionTokenCookie(event: RequestEventCommon, token: string, expiresAt: Date): void {
  event.cookie.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: event.url.protocol === "https:",
    expires: expiresAt,
    path: "/",
  });
}

export function deleteSessionTokenCookie(event: RequestEventCommon): void {
  event.cookie.set("session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: event.url.protocol === "https:",
    maxAge: 0,
    path: "/",
  });
}

export type SessionValidationResult = 
  | { session: Session; user: User }
  | { session: null; user: null };
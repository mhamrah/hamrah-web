import type { RequestEventCommon } from "@builder.io/qwik-city";
import { eq } from "drizzle-orm";
import { getDB, users } from "~/lib/db";
import { generateUserId } from "./utils";

interface UserProfile {
  email: string;
  name?: string;
  picture?: string | null;
  provider: "google" | "apple";
  providerId: string;
}

/**
 * Find an existing user by email or create a new one
 */
export const findOrCreateUser = async (
  event: RequestEventCommon,
  profile: UserProfile
): Promise<string> => {
  const db = getDB(event);

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  let userId: string;

  if (existingUser.length > 0) {
    // Just update the timestamp
    userId = existingUser[0].id;
    await db
      .update(users)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } else {
    // Create new user
    userId = generateUserId();
    await db.insert(users).values({
      id: userId,
      email: profile.email,
      name: profile.name || profile.email.split("@")[0], // Fallback display name
      picture: profile.picture,
      provider: profile.provider,
      providerId: profile.providerId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return userId;
};
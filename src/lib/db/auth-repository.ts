import type { RequestEventCommon } from "@builder.io/qwik-city";
import { eq } from "drizzle-orm";
import { getDB } from "./index";
import { users, type User, type NewUser } from "./schema";

export class AuthRepository {
  constructor(private event: RequestEventCommon) {}

  private get db() {
    return getDB(this.event);
  }

  /**
   * Create a new user
   */
  async createUser(userData: NewUser): Promise<User> {
    const result = await this.db.insert(users).values(userData).returning();
    return result[0];
  }

  /**
   * Update an existing user
   */
  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const result = await this.db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    
    if (result.length === 0) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    return result[0];
  }

  /**
   * Find a user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Find a user by ID
   */
  async findUserById(userId: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Find a user by provider ID
   */
  async findUserByProviderId(provider: string, providerId: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.provider, provider) && eq(users.providerId, providerId))
      .limit(1);
    
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Update user's last login information
   */
  async updateLastLogin(userId: string, platform?: string): Promise<void> {
    const updates: Partial<User> = {
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    };
    
    if (platform) {
      updates.lastLoginPlatform = platform;
    }

    await this.db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId));
  }
}
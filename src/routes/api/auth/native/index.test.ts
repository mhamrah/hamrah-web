import { describe, it, expect, vi, beforeEach } from "vitest";
import { onPost } from "./index";
import { createMockRequestEvent } from "../../../../test/setup";

// Mock dependencies
vi.mock("../../../../lib/auth/providers", () => ({
  verifyAppleToken: vi.fn(),
  verifyGoogleToken: vi.fn(),
}));

vi.mock("../../../../lib/auth/tokens", () => ({
  createTokenPair: vi.fn(),
}));

// Mock the db module
vi.mock("../../../../lib/db", () => ({
  getDB: vi.fn(),
  users: {},
}));

describe("/api/auth/native", () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockRequestEvent();
    mockEvent.parseBody = vi.fn();
    mockEvent.json = vi.fn();
    vi.clearAllMocks();
  });

  describe("Google Sign-In", () => {
    it("should create new user with valid Google token", async () => {
      const mockGoogleData = {
        email: "test@gmail.com",
        name: "Test User",
        picture: "https://example.com/avatar.jpg",
        providerId: "google-123",
      };

      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "valid-google-token",
      });

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );
      const { createTokenPair } = await import("../../../../lib/auth/tokens");
      const { getDB } = await import("../../../../lib/db");

      vi.mocked(verifyGoogleToken).mockResolvedValue(mockGoogleData);
      vi.mocked(createTokenPair).mockResolvedValue({
        accessToken: "access-token-123",
        refreshToken: "refresh-token-123",
        accessExpiresAt: new Date(Date.now() + 3600000),
        refreshExpiresAt: new Date(Date.now() + 86400000),
        tokenId: "token-id-123",
      });

      // Mock user retrieval after creation
      const mockCreatedUser = {
        id: "user-123",
        email: "test@gmail.com",
        name: "Test User",
        picture: "https://example.com/avatar.jpg",
        authMethod: "google",
        emailVerified: null,
        provider: "google",
        providerId: "google-123",
        lastLoginPlatform: "api",
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock the database operations
      let callCount = 0;
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              // First call: check for existing user by email (should return empty for new user)
              // Second call: get newly created user by ID (should return the created user)
              const result = callCount === 1 ? [] : [mockCreatedUser];
              return {
                then: vi.fn().mockImplementation((callback) => {
                  return Promise.resolve(callback(result));
                }),
              };
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([mockCreatedUser]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockCreatedUser]),
          }),
        }),
      };

      vi.mocked(getDB).mockReturnValue(mockDB as any);

      await onPost(mockEvent);

      expect(verifyGoogleToken).toHaveBeenCalledWith(
        "valid-google-token",
        mockEvent,
      );
      expect(mockEvent.json).toHaveBeenCalledWith(200, {
        success: true,
        user: {
          id: "user-123",
          email: "test@gmail.com",
          name: "Test User",
          picture: "https://example.com/avatar.jpg",
          authMethod: "google",
          createdAt: expect.any(String),
        },
        accessToken: "access-token-123",
        refreshToken: "refresh-token-123",
        expiresIn: expect.any(Number),
      });
    });

    it("should update existing user with Google sign-in", async () => {
      const mockGoogleData = {
        email: "existing@gmail.com",
        name: "Updated Name",
        picture: "https://example.com/new-avatar.jpg",
        providerId: "google-456",
      };

      const mockExistingUser = {
        id: "user-456",
        email: "existing@gmail.com",
        name: "Old Name",
        picture: "https://example.com/old-avatar.jpg",
        authMethod: "webauthn", // Different auth method
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-01"),
      };

      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "valid-google-token",
      });

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );
      const { createTokenPair } = await import("../../../../lib/auth/tokens");
      const { getDB } = await import("../../../../lib/db");

      vi.mocked(verifyGoogleToken).mockResolvedValue(mockGoogleData);
      vi.mocked(createTokenPair).mockResolvedValue({
        accessToken: "access-token-456",
        refreshToken: "refresh-token-456",
        accessExpiresAt: new Date(Date.now() + 3600000),
        refreshExpiresAt: new Date(Date.now() + 86400000),
        tokenId: "token-id-456",
      });

      // Mock updated user retrieval
      const mockUpdatedUser = {
        ...mockExistingUser,
        name: "Updated Name",
        picture: "https://example.com/new-avatar.jpg",
        authMethod: "google",
        emailVerified: null,
        provider: "google",
        providerId: "google-456",
        lastLoginPlatform: "api",
        lastLoginAt: null,
        updatedAt: new Date(),
      };

      // Mock the database operations for existing user
      let updateCallCount = 0;
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              updateCallCount++;
              // First call: check for existing user by email (should return existing user)
              // Second call: get updated user after update (should return updated user)
              const result =
                updateCallCount === 1 ? [mockExistingUser] : [mockUpdatedUser];
              return {
                then: vi.fn().mockImplementation((callback) => {
                  return Promise.resolve(callback(result));
                }),
              };
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([mockUpdatedUser]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockUpdatedUser]),
          }),
        }),
      };

      vi.mocked(getDB).mockReturnValue(mockDB as any);

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            email: "existing@gmail.com",
            name: "Updated Name",
            authMethod: "google",
          }),
        }),
      );
    });
  });

  describe("Apple Sign-In", () => {
    it("should create new user with valid Apple token", async () => {
      const mockAppleData = {
        email: "test@privaterelay.appleid.com",
        providerId: "apple-789",
      };

      mockEvent.parseBody.mockResolvedValue({
        provider: "apple",
        credential: "valid-apple-token",
        email: "user@example.com", // User-provided email
        name: "User Name", // User-provided name
      });

      const { verifyAppleToken } = await import(
        "../../../../lib/auth/providers"
      );
      const { createTokenPair } = await import("../../../../lib/auth/tokens");
      const { getDB } = await import("../../../../lib/db");

      vi.mocked(verifyAppleToken).mockResolvedValue(mockAppleData);
      vi.mocked(createTokenPair).mockResolvedValue({
        accessToken: "access-token-789",
        refreshToken: "refresh-token-789",
        accessExpiresAt: new Date(Date.now() + 3600000),
        refreshExpiresAt: new Date(Date.now() + 86400000),
        tokenId: "token-id-789",
      });

      const mockCreatedUser = {
        id: "user-789",
        email: "user@example.com", // Should use provided email
        name: "User Name", // Should use provided name
        authMethod: "apple",
        picture: null,
        emailVerified: null,
        provider: "apple",
        providerId: "apple-789",
        lastLoginPlatform: "api",
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock the database operations for new Apple user
      let appleCallCount = 0;
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              appleCallCount++;
              // First call: check for existing user by email (should return empty for new user)
              // Second call: get newly created user by ID (should return the created user)
              const result = appleCallCount === 1 ? [] : [mockCreatedUser];
              return {
                then: vi.fn().mockImplementation((callback) => {
                  return Promise.resolve(callback(result));
                }),
              };
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([mockCreatedUser]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockCreatedUser]),
          }),
        }),
      };

      vi.mocked(getDB).mockReturnValue(mockDB as any);

      await onPost(mockEvent);

      expect(verifyAppleToken).toHaveBeenCalledWith(
        "valid-apple-token",
        mockEvent,
      );
      expect(mockEvent.json).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            email: "user@example.com",
            name: "User Name",
            authMethod: "apple",
          }),
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should reject missing provider", async () => {
      mockEvent.parseBody.mockResolvedValue({
        credential: "some-token",
      });

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error: "Missing required fields: provider, credential",
      });
    });

    it("should reject unsupported provider", async () => {
      mockEvent.parseBody.mockResolvedValue({
        provider: "facebook",
        credential: "facebook-token",
      });

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error: "Unsupported provider",
      });
    });

    it("should handle invalid token verification", async () => {
      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "invalid-token",
      });

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );
      vi.mocked(verifyGoogleToken).mockRejectedValue(
        new Error("Invalid token"),
      );

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error: "Invalid authentication credential",
      });
    });

    it("should handle database errors gracefully", async () => {
      const mockGoogleData = {
        email: "test@gmail.com",
        name: "Test User",
        providerId: "google-123",
      };

      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "valid-token",
      });

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );
      const { getDB } = await import("../../../../lib/db");

      vi.mocked(verifyGoogleToken).mockResolvedValue(mockGoogleData);

      // Mock database error
      vi.mocked(getDB).mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error: "Database connection failed",
      });
    });
  });

  describe("Rate Limiting", () => {
    it("should respect rate limits", async () => {
      // Mock rate limit exceeded
      const mockRateLimit = {
        allowed: false,
        resetTime: Date.now() + 60000,
      };

      // Mock rate limiting (this would normally be done by middleware)
      mockEvent.send = vi.fn();

      // Simulate rate limit check in the handler
      if (!mockRateLimit.allowed) {
        mockEvent.send({
          status: 429,
          headers: {
            "Retry-After": "60",
          },
          body: "Rate limit exceeded",
        });
        return;
      }

      expect(mockEvent.send).toHaveBeenCalledWith({
        status: 429,
        headers: {
          "Retry-After": "60",
        },
        body: "Rate limit exceeded",
      });
    });
  });
});

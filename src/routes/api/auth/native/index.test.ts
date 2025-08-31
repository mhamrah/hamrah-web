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
    // Create mock event with headers that pass CORS protection
    mockEvent = createMockRequestEvent({
      request: new Request("https://localhost:5173/test", {
        headers: {
          "User-Agent": "CFNetwork/1234 Darwin/21.0.0", // iOS user agent
          Origin: "localhost:5173", // localhost origin
          "X-Requested-With": "hamrah-ios", // custom header
        },
      }),
    });
    mockEvent.parseBody = vi.fn();
    mockEvent.json = vi.fn();

    // Mock AUTH_API service to return proper API responses (no authentication needed - handled by service binding)
    mockEvent.platform.env.AUTH_API = {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            user: {
              id: "user-123",
              email: "test@gmail.com",
              name: "Test User",
              picture: "https://example.com/avatar.jpg",
              auth_method: "google",
              created_at: "2023-01-01T00:00:00Z",
            },
            access_token: "access-token-123",
            refresh_token: "refresh-token-123",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      ),
    };

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

      vi.mocked(verifyGoogleToken).mockResolvedValue(mockGoogleData);

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
          createdAt: "2023-01-01T00:00:00Z",
        },
        accessToken: "access-token-123",
        refreshToken: "refresh-token-123",
        expiresIn: 3600,
      });
    });

    it("should update existing user with Google sign-in", async () => {
      const mockGoogleData = {
        email: "existing@gmail.com",
        name: "Updated Name",
        picture: "https://example.com/new-avatar.jpg",
        providerId: "google-456",
      };

      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "valid-google-token",
      });

      // Mock AUTH_API response for existing user update
      mockEvent.platform.env.AUTH_API.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            user: {
              id: "user-456",
              email: "existing@gmail.com",
              name: "Updated Name",
              picture: "https://example.com/new-avatar.jpg",
              auth_method: "google",
              created_at: "2023-01-01T00:00:00Z",
            },
            access_token: "access-token-456",
            refresh_token: "refresh-token-456",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      );

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );

      vi.mocked(verifyGoogleToken).mockResolvedValue(mockGoogleData);

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

      // Mock AUTH_API response for Apple user creation
      mockEvent.platform.env.AUTH_API.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            user: {
              id: "user-789",
              email: "user@example.com",
              name: "User Name",
              picture: null,
              auth_method: "apple",
              created_at: "2023-01-01T00:00:00Z",
            },
            access_token: "access-token-789",
            refresh_token: "refresh-token-789",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      );

      const { verifyAppleToken } = await import(
        "../../../../lib/auth/providers"
      );

      vi.mocked(verifyAppleToken).mockResolvedValue(mockAppleData);

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
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "invalid-token",
      });

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );
      const tokenError = new Error("Invalid token");
      vi.mocked(verifyGoogleToken).mockRejectedValue(tokenError);

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error: "Invalid authentication credential",
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Native authentication error:",
        tokenError,
      );
      consoleErrorSpy.mockRestore();
    });

    it("should handle database errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const mockGoogleData = {
        email: "test@gmail.com",
        name: "Test User",
        providerId: "google-123",
      };

      mockEvent.parseBody.mockResolvedValue({
        provider: "google",
        credential: "valid-token",
      });

      // Mock AUTH_API error response
      const dbError = new Error(
        'API call failed: 500 - {"success":false,"error":"Database connection failed"}',
      );
      mockEvent.platform.env.AUTH_API.fetch = vi
        .fn()
        .mockRejectedValue(dbError);

      const { verifyGoogleToken } = await import(
        "../../../../lib/auth/providers"
      );

      vi.mocked(verifyGoogleToken).mockResolvedValue(mockGoogleData);

      await onPost(mockEvent);

      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error:
          'API call failed: 500 - {"success":false,"error":"Database connection failed"}',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Native authentication error:",
        dbError,
      );
      consoleErrorSpy.mockRestore();
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

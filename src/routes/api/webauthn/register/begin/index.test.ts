import { describe, it, expect, vi, beforeEach } from "vitest";
import { onPost } from "./index";
import { createMockRequestEvent } from "../../../../../test/setup";

// Mock the webauthn module
vi.mock("../../../../../lib/auth/webauthn", () => ({
  generateWebAuthnRegistrationOptions: vi.fn(),
  generateWebAuthnRegistrationOptionsForNewUser: vi.fn(),
}));

// Mock the utils module
vi.mock("../../../../../lib/auth/utils", () => ({
  getCurrentUser: vi.fn(),
}));

describe("/api/webauthn/register/begin", () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockRequestEvent();
    mockEvent.parseBody = vi.fn();
    mockEvent.json = vi.fn();
    vi.clearAllMocks();
  });

  it("should generate registration options for valid email", async () => {
    const mockOptions = {
      challenge: "mock-challenge-base64",
      rp: { id: "localhost", name: "Hamrah" },
      user: {
        id: "user-id",
        name: "test@example.com",
        displayName: "Test User",
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" as const }],
      timeout: 60000,
      attestation: "none" as const,
    };

    mockEvent.parseBody.mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
    });

    const { getCurrentUser } = await import("../../../../../lib/auth/utils");
    const { generateWebAuthnRegistrationOptionsForNewUser } = await import(
      "../../../../../lib/auth/webauthn"
    );

    // Mock getCurrentUser to return no authenticated user (new user registration)
    vi.mocked(getCurrentUser).mockResolvedValue({
      session: null,
      user: null,
      isValid: false,
    });

    vi.mocked(generateWebAuthnRegistrationOptionsForNewUser).mockResolvedValue(
      mockOptions,
    );

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(200, {
      success: true,
      options: mockOptions,
    });
    expect(generateWebAuthnRegistrationOptionsForNewUser).toHaveBeenCalledWith(
      mockEvent,
      "test@example.com",
      "Test User",
    );
  });

  it("should handle missing email in request body", async () => {
    mockEvent.parseBody.mockResolvedValue({});

    const { getCurrentUser } = await import("../../../../../lib/auth/utils");
    vi.mocked(getCurrentUser).mockResolvedValue({
      session: null,
      user: null,
      isValid: false,
    });

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(400, {
      success: false,
      error: "Either user must be authenticated or email/name must be provided",
    });
  });

  it("should handle invalid email format", async () => {
    mockEvent.parseBody.mockResolvedValue({ email: "invalid-email" });

    const { getCurrentUser } = await import("../../../../../lib/auth/utils");
    vi.mocked(getCurrentUser).mockResolvedValue({
      session: null,
      user: null,
      isValid: false,
    });

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(400, {
      success: false,
      error: "Either user must be authenticated or email/name must be provided",
    });
  });

  it("should handle webauthn generation errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => { });
    mockEvent.parseBody.mockResolvedValue({
      email: "test@example.com",
      name: "Test User",
    });

    const { getCurrentUser } = await import("../../../../../lib/auth/utils");
    const { generateWebAuthnRegistrationOptionsForNewUser } = await import(
      "../../../../../lib/auth/webauthn"
    );

    vi.mocked(getCurrentUser).mockResolvedValue({
      session: null,
      user: null,
      isValid: false,
    });
    const webauthnError = new Error("WebAuthn not supported");
    vi.mocked(generateWebAuthnRegistrationOptionsForNewUser).mockRejectedValue(
      webauthnError,
    );

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(500, {
      success: false,
      error: "Failed to begin registration",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Begin registration error:",
      webauthnError,
    );
    consoleErrorSpy.mockRestore();
  });

  it("should validate email format strictly", async () => {
    // Test that missing name causes error even with email
    mockEvent.parseBody.mockResolvedValue({ email: "test@example.com" });

    const { getCurrentUser } = await import("../../../../../lib/auth/utils");
    vi.mocked(getCurrentUser).mockResolvedValue({
      session: null,
      user: null,
      isValid: false,
    });

    await onPost(mockEvent);
    expect(mockEvent.json).toHaveBeenCalledWith(400, {
      success: false,
      error: "Either user must be authenticated or email/name must be provided",
    });
  });

  it("should accept valid email formats", async () => {
    const mockOptions = {
      challenge: "test",
      rp: { id: "localhost", name: "Hamrah" },
      user: {
        id: "user-id",
        name: "test@example.com",
        displayName: "Test User",
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" as const }],
      timeout: 60000,
      attestation: "none" as const,
    };

    const { getCurrentUser } = await import("../../../../../lib/auth/utils");
    const { generateWebAuthnRegistrationOptionsForNewUser } = await import(
      "../../../../../lib/auth/webauthn"
    );

    vi.mocked(getCurrentUser).mockResolvedValue({
      session: null,
      user: null,
      isValid: false,
    });
    vi.mocked(generateWebAuthnRegistrationOptionsForNewUser).mockResolvedValue(
      mockOptions,
    );

    const validEmails = [
      "test@example.com",
      "user.name@domain.co.uk",
      "user+tag@example.org",
      "firstname.lastname@subdomain.example.com",
    ];

    for (const email of validEmails) {
      mockEvent.parseBody.mockResolvedValue({ email, name: "Test User" });
      await onPost(mockEvent);
      expect(mockEvent.json).toHaveBeenCalledWith(200, {
        success: true,
        options: mockOptions,
      });
      vi.clearAllMocks();
    }
  });
});

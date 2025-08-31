import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from "vitest";
import {
  generateWebAuthnRegistrationOptions,
  generateWebAuthnRegistrationOptionsForNewUser,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnRegistration,
  verifyWebAuthnAuthentication
} from './webauthn';
import { createMockRequestEvent, mockDBResponse } from '../../test/setup';

// DB module and related mocks removed due to API-only migration.

// Mock the API client and its methods for API-only architecture
const apiClientSpies = {
  getWebAuthnRegistrationOptionsForNewUser: vi.fn(),
  getWebAuthnRegistrationOptionsForExistingUser: vi.fn(),
  verifyWebAuthnRegistration: vi.fn(),
  getWebAuthnAuthenticationOptions: vi.fn(),
  verifyWebAuthnAuthentication: vi.fn(),
  listWebAuthnCredentials: vi.fn(),
  deleteWebAuthnCredential: vi.fn(),
  updateWebAuthnCredentialName: vi.fn(),
};
vi.mock("./api-client", () => ({
  createApiClient: vi.fn(() => ({
    getWebAuthnRegistrationOptionsForNewUser: apiClientSpies.getWebAuthnRegistrationOptionsForNewUser,
    getWebAuthnRegistrationOptionsForExistingUser: apiClientSpies.getWebAuthnRegistrationOptionsForExistingUser,
    verifyWebAuthnRegistration: apiClientSpies.verifyWebAuthnRegistration,
    getWebAuthnAuthenticationOptions: apiClientSpies.getWebAuthnAuthenticationOptions,
    verifyWebAuthnAuthentication: apiClientSpies.verifyWebAuthnAuthentication,
    listWebAuthnCredentials: apiClientSpies.listWebAuthnCredentials,
    deleteWebAuthnCredential: apiClientSpies.deleteWebAuthnCredential,
    updateWebAuthnCredentialName: apiClientSpies.updateWebAuthnCredentialName,
  })),
}));

// Mock the session module
vi.mock("../../lib/auth/session", () => ({
  generateSessionToken: vi.fn(() => "mock-session-token"),
  createSession: vi.fn().mockResolvedValue({
    id: "mock-session-id",
    userId: "user-123",
    expiresAt: new Date(),
    createdAt: new Date(),
  }),
}));

// Mock the utils module
vi.mock("../../lib/auth/utils", () => ({
  generateRandomId: vi.fn(() => "mock-random-id"),
}));

// Mock the SimpleWebAuthn server module
vi.mock("@simplewebauthn/server", () => ({
  verifyAuthenticationResponse: vi.fn(),
}));

// All DB setup helpers removed due to API-only migration.

describe('WebAuthn Registration', () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockRequestEvent();
    vi.clearAllMocks();
  });

  describe('generateWebAuthnRegistrationOptions', () => {
    it('should generate registration options for new user', async () => {
      // Mock API client response
      apiClientSpies.getWebAuthnRegistrationOptionsForNewUser.mockResolvedValue({
        challenge: 'mock-challenge',
        rp: { id: 'localhost', name: 'Hamrah App' },
        user: { id: 'user-id', name: 'test@example.com', displayName: 'Test User' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
        },
      });

      const options = await generateWebAuthnRegistrationOptionsForNewUser(mockEvent, 'test@example.com', 'Test User');

      expect(options).toHaveProperty('challenge');
      expect(options).toHaveProperty('rp');
      expect(options.user.name).toBe('test@example.com');
      expect(apiClientSpies.getWebAuthnRegistrationOptionsForNewUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    it('should exclude existing credentials for returning user', async () => {
      // Mock existing user with credentials
      apiClientSpies.getWebAuthnRegistrationOptionsForExistingUser.mockResolvedValue({
        challenge: 'mock-challenge',
        excludeCredentials: [
          { id: 'cred-1', transports: ['internal'] },
          { id: 'cred-2', transports: ['internal'] },
        ],
      });

      const mockUserForRegistration = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
      await generateWebAuthnRegistrationOptions(mockEvent, mockUserForRegistration as any);

      expect(apiClientSpies.getWebAuthnRegistrationOptionsForExistingUser).toHaveBeenCalledWith({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    describe('verifyWebAuthnRegistration', () => {
      it('should verify valid registration response', async () => {
        const mockRegistrationResponse = {
          id: 'credential-id',
          rawId: 'credential-id',
          response: {
            clientDataJSON: 'client-data',
            attestationObject: 'attestation',
          },
          type: 'public-key',
        };

        // Mock API client response
        apiClientSpies.verifyWebAuthnRegistration.mockResolvedValue({
          success: true,
          verified: true,
          registrationInfo: {
            credentialID: new Uint8Array([1, 2, 3]),
            credentialPublicKey: new Uint8Array([4, 5, 6]),
            counter: 0,
            aaguid: 'test-aaguid',
          },
        });

        const mockChallenge = {
          id: 'challenge-id',
          challenge: 'mock-challenge',
          userId: 'user-123',
          type: 'registration',
          expiresAt: new Date(Date.now() + 60000), // 1 minute from now
          createdAt: new Date(),
        };

        // DB setup removed.

        const mockUserForVerification = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };

        // Mock API client response
        apiClientSpies.verifyWebAuthnRegistration.mockResolvedValue({
          verified: true,
          user: mockUserForVerification,
          credentialId: 'credential-id',
        });

        const result = await verifyWebAuthnRegistration(
          mockEvent,
          mockRegistrationResponse as any,
          'challenge-id',
          mockUserForVerification as any
        );

        expect(result.verified).toBe(true);
        expect(result.user).toHaveProperty('email', 'test@example.com');
        expect(apiClientSpies.verifyWebAuthnRegistration).toHaveBeenCalledWith({
          response: mockRegistrationResponse,
          challengeId: 'challenge-id',
          userId: 'user-123',
        });
      });

      it('should reject invalid registration response', async () => {
        // Mock API client response
        apiClientSpies.verifyWebAuthnRegistration.mockResolvedValue({
          success: false,
          verified: false,
          registrationInfo: undefined,
        });

        const mockChallenge = {
          id: 'challenge-id',
          challenge: 'mock-challenge',
          userId: 'user-123',
          type: 'registration',
          expiresAt: new Date(Date.now() + 60000),
          createdAt: new Date(),
        };

        // DB setup removed.

        const mockUserForFailure = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };

        // Mock API client response
        apiClientSpies.verifyWebAuthnRegistration.mockResolvedValue({
          verified: false,
          user: undefined,
          credentialId: undefined,
        });

        const result = await verifyWebAuthnRegistration(
          mockEvent,
          {} as any,
          'challenge-id',
          mockUserForFailure as any
        );

        expect(result.verified).toBe(false);
        expect(result.user).toBeUndefined();
        expect(apiClientSpies.verifyWebAuthnRegistration).toHaveBeenCalledWith({
          response: {} as any,
          challengeId: 'challenge-id',
          userId: 'user-123',
        });
      });
    });
  });

  describe('WebAuthn Authentication', () => {
    let mockEvent: any;

    beforeEach(() => {
      mockEvent = createMockRequestEvent();
      vi.clearAllMocks();
    });

    describe('generateWebAuthnAuthenticationOptions', () => {
      it('should generate authentication options for existing user', async () => {
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        };
        const mockCredentials = [
          { id: 'cred-1', publicKey: 'key-1' },
          { id: 'cred-2', publicKey: 'key-2' },
        ];

        // Mock API client response
        apiClientSpies.getWebAuthnAuthenticationOptions.mockResolvedValue({
          challenge: 'mock-challenge',
          allowCredentials: [
            { id: 'cred-1', type: 'public-key' },
            { id: 'cred-2', type: 'public-key' },
          ],
        });

        const options = await generateWebAuthnAuthenticationOptions(mockEvent, 'test@example.com');

        expect(options).toHaveProperty('challenge');
        expect(options).toHaveProperty('allowCredentials');
        expect(apiClientSpies.getWebAuthnAuthenticationOptions).toHaveBeenCalledWith({
          email: 'test@example.com',
        });
      });

      it('should throw error for non-existent user', async () => {
        // Mock API client to throw error
        apiClientSpies.getWebAuthnAuthenticationOptions.mockRejectedValue(new Error('User not found'));

        await expect(generateWebAuthnAuthenticationOptions(mockEvent, 'nonexistent@example.com'))
          .rejects.toThrow('User not found');
      });
    });

    describe('verifyWebAuthnAuthentication', () => {
      it('should verify valid authentication response', async () => {
        const mockAuthenticationResponse = {
          id: 'credential-id',
          rawId: 'credential-id',
          response: {
            clientDataJSON: 'client-data',
            authenticatorData: 'auth-data',
            signature: 'signature',
          },
          type: 'public-key',
        };

        const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
        (verifyAuthenticationResponse as any).mockResolvedValue({
          verified: true,
          authenticationInfo: {
            newCounter: 1,
          },
        } as any);

        const mockChallenge = {
          id: 'challenge-id',
          challenge: 'mock-challenge',
          userId: 'user-123',
          type: 'authentication',
          expiresAt: new Date(Date.now() + 60000),
          createdAt: new Date(),
        };

        const mockCredential = {
          id: 'credential-id',
          userId: 'user-123',
          publicKey: 'public-key',
          counter: 0,
        };

        const mockUser = { id: 'user-123', email: 'test@example.com', name: 'Test User' };

        // DB setup removed.

        // Mock API client response
        apiClientSpies.verifyWebAuthnAuthentication.mockResolvedValue({
          verified: true,
          user: mockUser,
          sessionToken: 'mock-session-token',
        });

        const mockAuthResp: any = mockAuthenticationResponse;
        const result = await verifyWebAuthnAuthentication(
          mockEvent,
          mockAuthResp,
          'challenge-id'
        );

        expect(result.verified).toBe(true);
        expect(result.user).toHaveProperty('id', 'user-123');
        expect(apiClientSpies.verifyWebAuthnAuthentication).toHaveBeenCalledWith({
          response: mockAuthenticationResponse,
          challengeId: 'challenge-id',
        });
      });

      it('should reject authentication with wrong credential', async () => {
        // Mock API client response
        apiClientSpies.verifyWebAuthnAuthentication.mockResolvedValue({
          success: false,
          verified: false,
          authenticationInfo: undefined,
        });

        const mockChallenge = {
          id: 'challenge-id',
          challenge: 'mock-challenge',
          userId: 'user-123',
          type: 'authentication',
          expiresAt: new Date(Date.now() + 60000),
          createdAt: new Date(),
        };

        // DB setup removed.

        // Mock API client response
        apiClientSpies.verifyWebAuthnAuthentication.mockResolvedValue({
          verified: false,
          user: undefined,
          sessionToken: undefined,
        });

        const wrongCredential: any = { id: 'wrong-credential-id' };
        const result = await verifyWebAuthnAuthentication(
          mockEvent,
          wrongCredential,
          'challenge-id'
        );

        expect(result.verified).toBe(false);
        expect(apiClientSpies.verifyWebAuthnAuthentication).toHaveBeenCalledWith({
          response: wrongCredential,
          challengeId: 'challenge-id',
        });
      });
    })
  })
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generateWebAuthnRegistrationOptions,
  generateWebAuthnRegistrationOptionsForNewUser,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnRegistration,
  verifyWebAuthnAuthentication 
} from './webauthn';
import { createMockRequestEvent, mockDBResponse } from '../../test/setup';

// Mock the db module
vi.mock("../../lib/db", () => ({
  getDB: vi.fn(),
  users: {},
  webauthnCredentials: {},
  webauthnChallenges: {},
}));

// Mock SimpleWebAuthn functions
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
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

// Global setup function for all tests
const setupMockDB = async (selectResults: any[] = []) => {
  const { getDB } = await import("../../lib/db");
  const mockDB = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(selectResults),
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(selectResults),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(selectResults),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
  vi.mocked(getDB).mockReturnValue(mockDB as any);
  return mockDB;
};

// Helper function to setup mock DB with specific query results
const setupMockDBWithResults = async (queryResults: { [key: string]: any[] } = {}) => {
  const { getDB } = await import("../../lib/db");
  const mockDB = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((condition) => {
          // Return different results based on the query
          const queryKey = condition.toString();
          if (queryKey.includes('webauthnCredentials')) {
            return {
              limit: vi.fn().mockResolvedValue(queryResults.credentials || []),
            };
          }
          if (queryKey.includes('webauthnChallenges')) {
            return {
              limit: vi.fn().mockResolvedValue(queryResults.challenges || []),
            };
          }
          return {
            limit: vi.fn().mockResolvedValue([]),
          };
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(queryResults.userCredentials || []),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(queryResults.credentialUser || []),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
  vi.mocked(getDB).mockReturnValue(mockDB as any);
  return mockDB;
};

describe('WebAuthn Registration', () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockRequestEvent();
    vi.clearAllMocks();
  });

  describe('generateWebAuthnRegistrationOptions', () => {
    it('should generate registration options for new user', async () => {
      // Mock SimpleWebAuthn response
      const { generateRegistrationOptions } = await import('@simplewebauthn/server');
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
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
      } as any);

      await setupMockDB([]);

      const options = await generateWebAuthnRegistrationOptionsForNewUser(mockEvent, 'test@example.com', 'Test User');

      expect(options).toHaveProperty('challenge');
      expect(options).toHaveProperty('rp');
      expect(options.user.name).toBe('test@example.com');
      expect(generateRegistrationOptions).toHaveBeenCalledWith({
        rpName: 'Hamrah App',
        rpID: 'localhost',
        userName: 'test@example.com',
        userDisplayName: 'Test User',
        attestationType: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        supportedAlgorithmIDs: [-7, -257],
        timeout: 60000,
      });
    });

    it('should exclude existing credentials for returning user', async () => {
      // Mock existing user with credentials
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };
      const mockCredentials = [
        { id: 'cred-1', publicKey: 'key-1', transports: '["internal"]' },
        { id: 'cred-2', publicKey: 'key-2', transports: '["internal"]' },
      ];

      // Mock the database to return credentials when querying for existing credentials
      const { getDB } = await import("../../lib/db");
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockCredentials),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDB as any);

      const { generateRegistrationOptions } = await import('@simplewebauthn/server');
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'mock-challenge',
        excludeCredentials: [
          { id: 'cred-1', type: 'public-key' },
          { id: 'cred-2', type: 'public-key' },
        ],
      } as any);

      const mockUserForRegistration = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
      await generateWebAuthnRegistrationOptions(mockEvent, mockUserForRegistration as any);

      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: [
            { id: 'cred-1', transports: ['internal'] },
            { id: 'cred-2', transports: ['internal'] },
          ],
        })
      );
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

      const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: new Uint8Array([1, 2, 3]),
          credentialPublicKey: new Uint8Array([4, 5, 6]),
          counter: 0,
          aaguid: 'test-aaguid',
        },
      } as any);

      const mockChallenge = {
        id: 'challenge-id',
        challenge: 'mock-challenge',
        userId: 'user-123',
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000), // 1 minute from now
        createdAt: new Date(),
      };

      await setupMockDB([mockChallenge]);

      const mockUserForVerification = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
      const result = await verifyWebAuthnRegistration(
        mockEvent,
        mockRegistrationResponse as any,
        'challenge-id',
        mockUserForVerification as any
      );

      expect(result.verified).toBe(true);
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(verifyRegistrationResponse).toHaveBeenCalledWith({
        response: mockRegistrationResponse,
        expectedChallenge: 'mock-challenge',
        expectedOrigin: 'https://localhost:5173',
        expectedRPID: 'localhost',
        requireUserVerification: false,
      });
    });

    it('should reject invalid registration response', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: false,
        registrationInfo: undefined,
      } as any);

      const mockChallenge = {
        id: 'challenge-id',
        challenge: 'mock-challenge',
        userId: 'user-123',
        type: 'registration',
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      };

      await setupMockDB([mockChallenge]);

      const mockUserForFailure = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
      const result = await verifyWebAuthnRegistration(
        mockEvent,
        {} as any,
        'challenge-id',
        mockUserForFailure as any
      );

      expect(result.verified).toBe(false);
      expect(result.user).toBeUndefined();
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

      await setupMockDBWithResults({
        credentials: mockCredentials,
        userCredentials: [{ user: mockUser, credential: mockCredentials[0] }, { user: mockUser, credential: mockCredentials[1] }],
        credentialUser: [{ credential: mockCredentials[0], user: mockUser }, { credential: mockCredentials[1], user: mockUser }],
      });

      const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'mock-challenge',
        allowCredentials: [
          { id: 'cred-1', type: 'public-key' },
          { id: 'cred-2', type: 'public-key' },
        ],
      } as any);

      const options = await generateWebAuthnAuthenticationOptions(mockEvent, 'test@example.com');

      expect(options).toHaveProperty('challenge');
      expect(options).toHaveProperty('allowCredentials');
      expect(generateAuthenticationOptions).toHaveBeenCalledWith({
        rpID: 'localhost',
        allowCredentials: [
          { id: 'cred-1' },
          { id: 'cred-2' },
        ],
        userVerification: 'preferred',
        timeout: 60000,
      });
    });

    it('should throw error for non-existent user', async () => {
      await setupMockDBWithResults();

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
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
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

      // Mock the database with specific results
      const { getDB } = await import("../../lib/db");
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockChallenge]),
            }),
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ credential: mockCredential, user: mockUser }]),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDB as any);

      const result = await verifyWebAuthnAuthentication(
        mockEvent,
        mockAuthenticationResponse as any,
        'challenge-id'
      );

      expect(result.verified).toBe(true);
      expect(result.user).toHaveProperty('id', 'user-123');
      expect(verifyAuthenticationResponse).toHaveBeenCalledWith({
        response: mockAuthenticationResponse,
        expectedChallenge: 'mock-challenge',
        expectedOrigin: 'https://localhost:5173',
        expectedRPID: 'localhost',
        credential: expect.objectContaining({
          id: 'credential-id',
          publicKey: expect.any(Buffer),
          counter: 0,
        }),
        requireUserVerification: false,
      });
    });

    it('should reject authentication with wrong credential', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: false,
        authenticationInfo: undefined,
      } as any);

      const mockChallenge = {
        id: 'challenge-id',
        challenge: 'mock-challenge',
        userId: 'user-123',
        type: 'authentication',
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      };

      // Mock the database with challenge but no credential
      const { getDB } = await import("../../lib/db");
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockChallenge]),
            }),
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]), // No credential found
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      vi.mocked(getDB).mockReturnValue(mockDB as any);

      const result = await verifyWebAuthnAuthentication(
        mockEvent,
        { id: 'wrong-credential-id' } as any,
        'challenge-id'
      );

      expect(result.verified).toBe(false);
    });
  });
});
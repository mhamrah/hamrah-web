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
}));

// Mock SimpleWebAuthn functions
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

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
        rp: { id: 'localhost', name: 'Hamrah' },
        user: { id: 'user-id', name: 'test@example.com', displayName: 'Test User' },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
      } as any);

      const { getDB } = await import("../../lib/db");
      
      // Mock empty user lookup (new user)
      const mockDB = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]), // No existing user
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
      };
      vi.mocked(getDB).mockReturnValue(mockDB as any);

      const options = await generateWebAuthnRegistrationOptionsForNewUser(mockEvent, 'test@example.com', 'Test User');

      expect(options).toHaveProperty('challenge');
      expect(options).toHaveProperty('rp');
      expect(options.user.name).toBe('test@example.com');
      expect(generateRegistrationOptions).toHaveBeenCalledWith({
        rpName: 'Hamrah',
        rpID: 'localhost',
        userID: expect.any(String),
        userName: 'test@example.com',
        userDisplayName: 'test@example.com',
        attestationType: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        supportedAlgorithmIDs: [-7, -257],
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
        { id: 'cred-1', publicKey: 'key-1' },
        { id: 'cred-2', publicKey: 'key-2' },
      ];

      mockEvent.platform.D1 = mockDBResponse([mockUser]);
      
      // Mock credential lookup
      mockEvent.platform.D1.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockCredentials),
        }),
      });

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
            { id: 'cred-1', type: 'public-key', transports: ['internal'] },
            { id: 'cred-2', type: 'public-key', transports: ['internal'] },
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

      mockEvent.platform.D1 = mockDBResponse([]);

      const mockUserForVerification = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
      const result = await verifyWebAuthnRegistration(
        mockEvent,
        mockRegistrationResponse as any,
        'mock-challenge',
        mockUserForVerification as any
      );

      expect(result.verified).toBe(true);
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(verifyRegistrationResponse).toHaveBeenCalledWith({
        response: mockRegistrationResponse,
        expectedChallenge: 'mock-challenge',
        expectedOrigin: 'https://localhost:5173',
        expectedRPID: 'localhost',
      });
    });

    it('should reject invalid registration response', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: false,
        registrationInfo: undefined,
      } as any);

      const mockUserForFailure = { id: 'user-123', email: 'test@example.com', name: 'Test User', picture: null, emailVerified: null, authMethod: null, provider: null, providerId: null, lastLoginPlatform: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
      const result = await verifyWebAuthnRegistration(
        mockEvent,
        {} as any,
        'mock-challenge',
        mockUserForFailure as any
      );

      expect(result.verified).toBe(false);
      expect(result.user).toBeNull();
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
      };
      const mockCredentials = [
        { id: 'cred-1', transports: '["internal"]' },
      ];

      mockEvent.platform.D1 = mockDBResponse([mockUser]);
      mockEvent.platform.D1.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockCredentials),
        }),
      });

      const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
        allowCredentials: [
          { id: 'cred-1', type: 'public-key', transports: ['internal'] },
        ],
      } as any);

      const options = await generateWebAuthnAuthenticationOptions(mockEvent, 'test@example.com');

      expect(options).toHaveProperty('challenge');
      expect(options.allowCredentials).toHaveLength(1);
      expect(generateAuthenticationOptions).toHaveBeenCalledWith({
        rpID: 'localhost',
        allowCredentials: [
          { id: 'cred-1', type: 'public-key', transports: ['internal'] },
        ],
        userVerification: 'required',
      });
    });

    it('should throw error for non-existent user', async () => {
      mockEvent.platform.D1 = mockDBResponse([]);

      await expect(
        generateWebAuthnAuthenticationOptions(mockEvent, 'nonexistent@example.com')
      ).rejects.toThrow('User not found');
    });
  });

  describe('verifyWebAuthnAuthentication', () => {
    it('should verify valid authentication response', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };
      const mockCredential = {
        id: 'cred-1',
        publicKey: 'public-key-data',
        counter: 0,
      };

      mockEvent.platform.D1 = mockDBResponse([mockUser]);
      mockEvent.platform.D1.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockCredential]),
        }),
      });

      const mockAuthResponse = {
        id: 'cred-1',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'auth-data',
          signature: 'signature',
        },
      };

      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
        },
      } as any);

      const result = await verifyWebAuthnAuthentication(
        mockEvent,
        mockAuthResponse as any,
        'auth-challenge'
      );

      expect(result.verified).toBe(true);
      expect(result.user).toHaveProperty('email', 'test@example.com');
      expect(verifyAuthenticationResponse).toHaveBeenCalled();
    });

    it('should reject authentication with wrong credential', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockEvent.platform.D1 = mockDBResponse([mockUser]);
      mockEvent.platform.D1.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // No matching credential
        }),
      });

      const mockAuthResponse = {
        id: 'wrong-cred-id',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'auth-data',
          signature: 'signature',
        },
      };

      await expect(
        verifyWebAuthnAuthentication(
          mockEvent,
          mockAuthResponse as any,
          'auth-challenge'
        )
      ).rejects.toThrow('Credential not found');
    });
  });
});
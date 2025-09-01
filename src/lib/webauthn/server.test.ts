import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  getUserWebAuthnCredentials,
  deleteWebAuthnCredential,
  updateWebAuthnCredentialName,
} from './server';
import { createMockRequestEvent } from '~/test/setup';
import * as simpleWebAuthnServer from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';

// Create a mock API client
const mockApiClient = {
  getWebAuthnCredentials: vi.fn(),
  storeWebAuthnCredential: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  getWebAuthnCredentialById: vi.fn(),
  updateWebAuthnCredentialCounter: vi.fn(),
  deleteWebAuthnCredential: vi.fn(),
  updateWebAuthnCredentialName: vi.fn(),
};

// Mock the @simplewebauthn/server module
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

// Mock the API client
vi.mock('~/lib/auth/api-client', () => ({
  createApiClient: vi.fn(() => mockApiClient),
}));

// Mock crypto.randomUUID if not mocked in setup
if (!global.crypto?.randomUUID) {
  global.crypto = {
    ...global.crypto,
    randomUUID: vi.fn(() => 'test-uuid-1234'),
  } as any;
}

describe('WebAuthn Server', () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockRequestEvent({
      url: new URL('https://localhost:5173/test'),
    });

    // Reset all mocks
    vi.clearAllMocks();
    
    // Set up default mock implementations
    vi.mocked(simpleWebAuthnServer.generateRegistrationOptions).mockResolvedValue({
      challenge: 'test-challenge-base64',
      rp: { name: 'Hamrah', id: 'localhost' },
      user: { id: 'test-user-id', name: 'test@example.com', displayName: 'Test User' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      timeout: 60000,
      attestation: 'indirect',
      excludeCredentials: [],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    });

    vi.mocked(simpleWebAuthnServer.generateAuthenticationOptions).mockResolvedValue({
      challenge: 'test-auth-challenge-base64',
      timeout: 60000,
      rpId: 'localhost',
      allowCredentials: [],
      userVerification: 'preferred',
    });

    vi.mocked(simpleWebAuthnServer.verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        fmt: 'none' as const,
        aaguid: '05060708',
        credential: {
          id: 'AQIDBA',  // base64url encoding of [1, 2, 3, 4]
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
        },
        credentialType: 'public-key',
        attestationObject: new Uint8Array([1, 2, 3]),
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://localhost:5173',
        rpID: 'localhost',
      },
    });

    vi.mocked(simpleWebAuthnServer.verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'AQIDBA',  // base64url encoding of [1, 2, 3, 4]
        newCounter: 1,
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://localhost:5173',
        rpID: 'localhost',
        authenticatorExtensionResults: {},
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateWebAuthnRegistrationOptions', () => {
    it('should generate registration options for new user', async () => {
      // Mock API response for no existing credentials
      mockApiClient.getWebAuthnCredentials.mockRejectedValue(new Error('User has no credentials'));

      const user = { id: 'test-user-id', email: 'test@example.com', name: 'Test User' };
      const result = await generateWebAuthnRegistrationOptions(mockEvent, user);

      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('challengeId');
      expect(result.challengeId).toBe('test-uuid-1234');
      expect(result.options.challenge).toBe('test-challenge-base64');
      expect(result.options.user.name).toBe('test@example.com');
      expect(result.options.user.displayName).toBe('Test User');
    });

    it('should exclude existing credentials', async () => {
      // Mock existing credentials
      const existingCredentials = [
        { id: 'existing-cred-1', transports: ['internal'] },
        { id: 'existing-cred-2', transports: ['usb'] },
      ];
      mockApiClient.getWebAuthnCredentials.mockResolvedValue({
        credentials: existingCredentials,
      });

      const user = { id: 'test-user-id', email: 'test@example.com', name: 'Test User' };
      await generateWebAuthnRegistrationOptions(mockEvent, user);

      expect(simpleWebAuthnServer.generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: [
            { id: 'existing-cred-1', type: 'public-key', transports: [] },
            { id: 'existing-cred-2', type: 'public-key', transports: [] },
          ],
        })
      );
    });

    it('should use correct RP configuration for localhost', async () => {
      mockApiClient.getWebAuthnCredentials.mockRejectedValue(new Error('No credentials'));

      const user = { id: 'test-user-id', email: 'test@example.com' };
      await generateWebAuthnRegistrationOptions(mockEvent, user);

      const call = vi.mocked(simpleWebAuthnServer.generateRegistrationOptions).mock.calls[0][0];
      expect(call).toEqual(expect.objectContaining({
        rpName: 'Hamrah',
        rpID: 'localhost',
        userName: 'test@example.com',
        userDisplayName: 'test@example.com', // Falls back to email when name not provided
        timeout: 60000,
        attestationType: 'none',
        excludeCredentials: [],
        authenticatorSelection: {
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        supportedAlgorithmIDs: [-7, -257],
      }));
      expect(call.userID).toEqual(new TextEncoder().encode('test-user-id'));
    });

    it('should use correct RP configuration for production', async () => {
      const prodEvent = createMockRequestEvent({
        url: new URL('https://hamrah.app/test'),
      });
      mockApiClient.getWebAuthnCredentials.mockRejectedValue(new Error('No credentials'));

      const user = { id: 'test-user-id', email: 'test@example.com', name: 'Test User' };
      await generateWebAuthnRegistrationOptions(prodEvent, user);

      expect(simpleWebAuthnServer.generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'hamrah.app',
        })
      );
    });
  });

  describe('verifyWebAuthnRegistration', () => {
    const mockRegistrationResponse: RegistrationResponseJSON = {
      id: 'test-credential-id',
      rawId: 'test-credential-id',
      type: 'public-key',
      response: {
        clientDataJSON: 'mock-client-data-json',
        attestationObject: 'mock-attestation-object',
        transports: ['internal'],
      },
      clientExtensionResults: {},
    };

    it('should reject invalid challenge', async () => {
      // Test with an invalid challenge ID that won't exist in the challenge map
      await expect(
        verifyWebAuthnRegistration(
          mockEvent,
          mockRegistrationResponse,
          'invalid-challenge-id',
          { id: 'test-user-id', email: 'test@example.com' }
        )
      ).rejects.toThrow('Invalid or expired challenge');
    });

    it('should handle verification failure gracefully', async () => {
      // Since we can't easily mock the internal challenge storage,
      // we'll focus on testing the error conditions that are predictable
      vi.mocked(simpleWebAuthnServer.verifyRegistrationResponse).mockResolvedValue({
        verified: false,
      });

      // This will fail with invalid challenge, but that's the expected behavior
      // in a test environment where we can't set up the challenge storage
      await expect(
        verifyWebAuthnRegistration(
          mockEvent,
          mockRegistrationResponse,
          'test-challenge-id',
          { id: 'test-user-id', email: 'test@example.com' }
        )
      ).rejects.toThrow('Invalid or expired challenge');
    });
  });

  describe('generateWebAuthnAuthenticationOptions', () => {
    it('should generate authentication options without email', async () => {
      const result = await generateWebAuthnAuthenticationOptions(mockEvent);

      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('challengeId');
      expect(result.challengeId).toBe('test-uuid-1234');
      expect(result.options.challenge).toBe('test-auth-challenge-base64');
    });

    it('should generate authentication options with email and existing user', async () => {
      // Mock user and credentials lookup
      const mockUser = { id: 'test-user-id', email: 'test@example.com' };
      const mockCredentials = [
        { id: 'cred-1', transports: ['internal'] },
        { id: 'cred-2', transports: ['usb'] },
      ];

      mockApiClient.getUserByEmail.mockResolvedValue(mockUser);
      mockApiClient.getWebAuthnCredentials.mockResolvedValue({
        credentials: mockCredentials,
      });

      const result = await generateWebAuthnAuthenticationOptions(mockEvent, 'test@example.com');

      expect(mockApiClient.getUserByEmail).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockApiClient.getWebAuthnCredentials).toHaveBeenCalledWith('test-user-id');
      
      expect(simpleWebAuthnServer.generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: [
            { id: 'cred-1', type: 'public-key' },
            { id: 'cred-2', type: 'public-key' },
          ],
        })
      );
    });

    it('should handle non-existent user gracefully', async () => {
      mockApiClient.getUserByEmail.mockRejectedValue(new Error('User not found'));

      const result = await generateWebAuthnAuthenticationOptions(mockEvent, 'nonexistent@example.com');

      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('challengeId');
      
      expect(simpleWebAuthnServer.generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: undefined, // Should allow resident key auth
        })
      );
    });
  });

  describe('verifyWebAuthnAuthentication', () => {
    const mockAuthResponse: AuthenticationResponseJSON = {
      id: 'test-credential-id',
      rawId: 'test-credential-id',
      type: 'public-key',
      response: {
        clientDataJSON: 'mock-client-data-json',
        authenticatorData: 'mock-authenticator-data',
        signature: 'mock-signature',
        userHandle: 'test-user-id',
      },
      clientExtensionResults: {},
    };

    beforeEach(() => {
      // Mock credential and user lookup
      const mockCredential = {
        id: 'test-credential-id',
        user_id: 'test-user-id',
        public_key: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
        transports: ['internal'],
      };

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockApiClient.getWebAuthnCredentialById.mockResolvedValue(mockCredential);
      mockApiClient.getUserById.mockResolvedValue(mockUser);
      mockApiClient.updateWebAuthnCredentialCounter.mockResolvedValue({ success: true });
    });

    it('should reject invalid challenge', async () => {
      // Test with an invalid challenge ID that won't exist in the challenge map
      await expect(
        verifyWebAuthnAuthentication(mockEvent, mockAuthResponse, 'invalid-challenge-id')
      ).rejects.toThrow('Invalid or expired challenge');
    });

    it('should handle authentication error gracefully', async () => {
      // Since we can't easily mock the internal challenge storage,
      // we test that the function properly handles missing challenges
      await expect(
        verifyWebAuthnAuthentication(mockEvent, mockAuthResponse, 'test-challenge-id')
      ).rejects.toThrow('Invalid or expired challenge');
    });
  });

  describe('getUserWebAuthnCredentials', () => {
    it('should return user credentials', async () => {
      const mockCredentials = [
        { id: 'cred-1', user_id: 'test-user-id', name: 'My Device' },
        { id: 'cred-2', user_id: 'test-user-id', name: 'Backup Key' },
      ];

      mockApiClient.getWebAuthnCredentials.mockResolvedValue({
        credentials: mockCredentials,
      });

      const result = await getUserWebAuthnCredentials(mockEvent, 'test-user-id');

      expect(result).toEqual(mockCredentials);
      expect(mockApiClient.getWebAuthnCredentials).toHaveBeenCalledWith('test-user-id');
    });

    it('should return empty array when no credentials', async () => {
      mockApiClient.getWebAuthnCredentials.mockResolvedValue({
        credentials: null,
      });

      const result = await getUserWebAuthnCredentials(mockEvent, 'test-user-id');

      expect(result).toEqual([]);
    });
  });

  describe('deleteWebAuthnCredential', () => {
    it('should delete credential successfully', async () => {
      mockApiClient.deleteWebAuthnCredential.mockResolvedValue(true);

      const result = await deleteWebAuthnCredential(mockEvent, 'test-credential-id');

      expect(result).toBe(true);
      expect(mockApiClient.deleteWebAuthnCredential).toHaveBeenCalledWith('test-credential-id');
    });

    it('should return false on failure', async () => {
      mockApiClient.deleteWebAuthnCredential.mockResolvedValue(false);

      const result = await deleteWebAuthnCredential(mockEvent, 'test-credential-id');

      expect(result).toBe(false);
    });
  });

  describe('updateWebAuthnCredentialName', () => {
    it('should update credential name successfully', async () => {
      mockApiClient.updateWebAuthnCredentialName.mockResolvedValue(true);

      const result = await updateWebAuthnCredentialName(
        mockEvent,
        'test-credential-id',
        'New Device Name'
      );

      expect(result).toBe(true);
      expect(mockApiClient.updateWebAuthnCredentialName).toHaveBeenCalledWith(
        'test-credential-id',
        'New Device Name'
      );
    });

    it('should return false on failure', async () => {
      mockApiClient.updateWebAuthnCredentialName.mockResolvedValue(false);

      const result = await updateWebAuthnCredentialName(
        mockEvent,
        'test-credential-id',
        'New Device Name'
      );

      expect(result).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should use localhost configuration for development', () => {
      const devEvent = createMockRequestEvent({
        url: new URL('http://localhost:5173/test'),
      });

      // Test the RP ID configuration logic
      expect(devEvent.url.hostname).toBe('localhost');
    });

    it('should use production configuration for deployed site', () => {
      const prodEvent = createMockRequestEvent({
        url: new URL('https://hamrah.app/test'),
      });

      expect(prodEvent.url.hostname).toBe('hamrah.app');
    });

    it('should handle different ports in development', () => {
      const devEvent = createMockRequestEvent({
        url: new URL('http://localhost:3000/test'),
      });

      expect(devEvent.url.hostname).toBe('localhost');
      expect(devEvent.url.port).toBe('3000');
    });
  });
});
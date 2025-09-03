import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebAuthnClient, webauthnClient } from './webauthn';
import { mockFetchResponse } from '../../test/setup';

// Mock @simplewebauthn/browser
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

// Mock @simplewebauthn/server
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

// Mock internal API client
vi.mock('./internal-api-client', () => ({
  createApiClient: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  })),
}));

describe('WebAuthnClient', () => {
  let mockApiClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock crypto.randomUUID
    global.crypto = {
      ...global.crypto,
      randomUUID: vi.fn(() => 'test-uuid-1234'),
    };

    // Mock window.PublicKeyCredential for WebAuthn support
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: class MockPublicKeyCredential {},
      writable: true,
    });

    Object.defineProperty(window.navigator, 'credentials', {
      value: {
        create: vi.fn(),
        get: vi.fn(),
      },
      writable: true,
    });

    // Get the mocked API client
    const { createApiClient } = await import('./internal-api-client');
    mockApiClient = createApiClient();
  });

  describe('isSupported', () => {
    it('should return true when WebAuthn is supported', () => {
      expect(WebAuthnClient.isSupported()).toBe(true);
    });

    it('should return false when PublicKeyCredential is not available', () => {
      // @ts-ignore
      delete window.PublicKeyCredential;
      expect(WebAuthnClient.isSupported()).toBe(false);
    });

    it('should return false when navigator.credentials is not available', () => {
      // @ts-ignore
      delete window.navigator.credentials;
      expect(WebAuthnClient.isSupported()).toBe(false);
    });
  });

  describe('hasPasskeys', () => {
    it('should return true when user exists and has credentials', async () => {
      mockApiClient.get
        .mockResolvedValueOnce({
          success: true,
          user: { id: 'user-123' },
        })
        .mockResolvedValueOnce({
          success: true,
          credentials: [{ id: 'cred-1' }],
        });

      const result = await webauthnClient.hasPasskeys('test@example.com');
      expect(result).toBe(true);
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/users/by-email/test@example.com');
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/webauthn/users/user-123/credentials');
    });

    it('should return false when user does not exist', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        success: false,
        user: null,
      });

      const result = await webauthnClient.hasPasskeys('nonexistent@example.com');
      expect(result).toBe(false);
    });

    it('should return false when user has no credentials', async () => {
      mockApiClient.get
        .mockResolvedValueOnce({
          success: true,
          user: { id: 'user-123' },
        })
        .mockResolvedValueOnce({
          success: true,
          credentials: [],
        });

      const result = await webauthnClient.hasPasskeys('test@example.com');
      expect(result).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const result = await webauthnClient.hasPasskeys('test@example.com');
      expect(result).toBe(false);
    });
  });

  describe('registerPasskey', () => {
    it('should register a new passkey for new user', async () => {
      const { generateRegistrationOptions, verifyRegistrationResponse } = await import('@simplewebauthn/server');
      const { startRegistration } = await import('@simplewebauthn/browser');

      // Mock user doesn't exist
      mockApiClient.get.mockResolvedValueOnce({
        success: false,
        user: null,
      });

      // Mock registration options generation
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
        rp: { name: 'Hamrah App', id: 'hamrah.app' },
        user: { id: 'user-123', name: 'test@example.com', displayName: 'Test User' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        excludeCredentials: [],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        attestation: 'none',
      } as any);

      // Mock browser registration
      vi.mocked(startRegistration).mockResolvedValue({
        id: 'credential-id',
        rawId: 'credential-id',
        response: {
          attestationObject: 'attestation-object',
          clientDataJSON: 'client-data-json',
          transports: ['internal'],
        },
        type: 'public-key',
      } as any);

      // Mock verification
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: new Uint8Array([1, 2, 3, 4]),
          credentialPublicKey: new Uint8Array([5, 6, 7, 8]),
          counter: 0,
        },
      } as any);

      // Mock API calls
      mockApiClient.post.mockResolvedValue({ success: true });
      mockApiClient.delete.mockResolvedValue({ success: true });

      const result = await webauthnClient.registerPasskey({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/internal/users', expect.objectContaining({
        email: 'test@example.com',
        name: 'Test User',
        auth_method: 'webauthn',
      }));
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/webauthn/credentials', expect.any(Object));
    });

    it('should register additional passkey for existing user', async () => {
      const { generateRegistrationOptions, verifyRegistrationResponse } = await import('@simplewebauthn/server');
      const { startRegistration } = await import('@simplewebauthn/browser');

      // Mock user exists with existing credentials
      mockApiClient.get
        .mockResolvedValueOnce({
          success: true,
          user: { id: 'existing-user-123' },
        })
        .mockResolvedValueOnce({
          success: true,
          credentials: [{ id: 'existing-cred', transports: ['usb'] }],
        });

      // Mock registration options generation
      vi.mocked(generateRegistrationOptions).mockResolvedValue({
        challenge: 'test-challenge',
        excludeCredentials: [{ id: 'existing-cred', type: 'public-key', transports: ['usb'] }],
      } as any);

      // Mock successful registration
      vi.mocked(startRegistration).mockResolvedValue({
        id: 'new-credential-id',
        response: { transports: ['internal'] },
      } as any);

      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: new Uint8Array([1, 2, 3, 4]),
          credentialPublicKey: new Uint8Array([5, 6, 7, 8]),
          counter: 0,
        },
      } as any);

      mockApiClient.post.mockResolvedValue({ success: true });
      mockApiClient.delete.mockResolvedValue({ success: true });

      const result = await webauthnClient.registerPasskey({
        email: 'existing@example.com',
        name: 'Existing User',
      });

      expect(result.success).toBe(true);
      // Should not create new user for existing user
      expect(mockApiClient.post).not.toHaveBeenCalledWith('/api/internal/users', expect.any(Object));
      // Should store credential
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/webauthn/credentials', expect.any(Object));
    });

    it('should handle WebAuthn not supported', async () => {
      // @ts-ignore
      delete window.PublicKeyCredential;

      const result = await webauthnClient.registerPasskey({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('WebAuthn is not supported in this browser');
    });

    it('should handle registration failure', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server');
      const { startRegistration } = await import('@simplewebauthn/browser');

      mockApiClient.get.mockResolvedValue({ success: false });
      vi.mocked(generateRegistrationOptions).mockResolvedValue({ challenge: 'test' } as any);
      vi.mocked(startRegistration).mockRejectedValue(new Error('User cancelled'));

      const result = await webauthnClient.registerPasskey({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User cancelled');
    });
  });

  describe('authenticateWithPasskey', () => {
    it('should authenticate with valid passkey', async () => {
      const { generateAuthenticationOptions, verifyAuthenticationResponse } = await import('@simplewebauthn/server');
      const { startAuthentication } = await import('@simplewebauthn/browser');

      // Mock user and credentials exist
      mockApiClient.get
        .mockResolvedValueOnce({
          success: true,
          user: { id: 'user-123', email: 'test@example.com' },
        })
        .mockResolvedValueOnce({
          success: true,
          credentials: [{
            id: 'Y3JlZC0x', // 'cred-1' in base64url
            public_key: 'cHVibGljLWtleQ==', // 'public-key' in base64
            counter: 1,
            transports: ['internal'],
          }],
        });

      // Mock authentication options generation
      vi.mocked(generateAuthenticationOptions).mockResolvedValue({
        challenge: 'auth-challenge',
        allowCredentials: [{
          id: 'Y3JlZC0x',
          type: 'public-key',
          transports: ['internal'],
        }],
      } as any);

      // Mock browser authentication
      vi.mocked(startAuthentication).mockResolvedValue({
        id: 'Y3JlZC0x',
        rawId: 'Y3JlZC0x',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'auth-data',
          signature: 'signature',
        },
        type: 'public-key',
      } as any);

      // Mock verification
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 2,
        },
      } as any);

      // Mock API calls
      mockApiClient.post.mockResolvedValue({ success: true, session: { id: 'session-123' } });
      mockApiClient.patch.mockResolvedValue({ success: true });
      mockApiClient.delete.mockResolvedValue({ success: true });

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: 'user-123', email: 'test@example.com' });
      expect(result.session_token).toBe('session-123');
      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/webauthn/credentials/Y3JlZC0x/counter', {
        counter: 2,
        last_used: expect.any(Number),
      });
    });

    it('should fail when user not found', async () => {
      mockApiClient.get.mockResolvedValue({
        success: false,
        user: null,
      });

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'nonexistent@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail when no credentials found', async () => {
      mockApiClient.get
        .mockResolvedValueOnce({
          success: true,
          user: { id: 'user-123' },
        })
        .mockResolvedValueOnce({
          success: true,
          credentials: [],
        });

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No passkeys found for this user');
    });

    it('should handle authentication cancellation', async () => {
      const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
      const { startAuthentication } = await import('@simplewebauthn/browser');

      mockApiClient.get
        .mockResolvedValueOnce({ success: true, user: { id: 'user-123' } })
        .mockResolvedValueOnce({ success: true, credentials: [{ id: 'cred-1' }] });

      vi.mocked(generateAuthenticationOptions).mockResolvedValue({ challenge: 'test' } as any);
      vi.mocked(startAuthentication).mockRejectedValue(new Error('User cancelled'));

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User cancelled');
    });
  });

  describe('getUserPasskeys', () => {
    it('should return user passkeys', async () => {
      const mockCredentials = [
        { id: 'cred-1', name: 'Passkey 1' },
        { id: 'cred-2', name: 'Passkey 2' },
      ];

      mockApiClient.get.mockResolvedValue({
        success: true,
        credentials: mockCredentials,
      });

      const result = await webauthnClient.getUserPasskeys('user-123');
      expect(result).toEqual(mockCredentials);
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/webauthn/users/user-123/credentials');
    });

    it('should return empty array on API error', async () => {
      mockApiClient.get.mockRejectedValue(new Error('API error'));

      const result = await webauthnClient.getUserPasskeys('user-123');
      expect(result).toEqual([]);
    });
  });

  describe('deletePasskey', () => {
    it('should delete passkey successfully', async () => {
      mockApiClient.delete.mockResolvedValue({ success: true });

      const result = await webauthnClient.deletePasskey('cred-123');
      expect(result).toBe(true);
      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/webauthn/credentials/cred-123');
    });

    it('should handle delete failure', async () => {
      mockApiClient.delete.mockResolvedValue({ success: false });

      const result = await webauthnClient.deletePasskey('cred-123');
      expect(result).toBe(false);
    });

    it('should handle API error', async () => {
      mockApiClient.delete.mockRejectedValue(new Error('Network error'));

      const result = await webauthnClient.deletePasskey('cred-123');
      expect(result).toBe(false);
    });
  });

  describe('renamePasskey', () => {
    it('should rename passkey successfully', async () => {
      mockApiClient.patch.mockResolvedValue({ success: true });

      const result = await webauthnClient.renamePasskey('cred-123', 'New Name');
      expect(result).toBe(true);
      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/webauthn/credentials/cred-123/name', {
        name: 'New Name',
      });
    });

    it('should handle rename failure', async () => {
      mockApiClient.patch.mockResolvedValue({ success: false });

      const result = await webauthnClient.renamePasskey('cred-123', 'New Name');
      expect(result).toBe(false);
    });

    it('should handle API error', async () => {
      mockApiClient.patch.mockRejectedValue(new Error('Network error'));

      const result = await webauthnClient.renamePasskey('cred-123', 'New Name');
      expect(result).toBe(false);
    });
  });
});
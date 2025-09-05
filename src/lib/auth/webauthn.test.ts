import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebAuthnClient } from './webauthn';

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

// Mock public API client
vi.mock('./api-client', () => {
  const mockApiClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    createApiClient: vi.fn(() => mockApiClient),
    mockApiClient, // Export for test access
  };
});

describe('WebAuthnClient', () => {
  let webauthnClient: WebAuthnClient;
  let mockApiClient: any;
  let mockFetch: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock crypto.randomUUID
    global.crypto = {
      ...global.crypto,
      randomUUID: vi.fn(() => 'test-uuid-1234') as () => `${string}-${string}-${string}-${string}-${string}`,
    };

    // Mock fetch for WebAuthn API calls
    mockFetch = vi.fn();
    global.fetch = mockFetch;

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

    // Get access to the mock API client
    const apiClientModule = await import('./api-client') as any;
    mockApiClient = apiClientModule.mockApiClient;

    // Create a fresh WebAuthn client instance
    webauthnClient = new WebAuthnClient();
  });

  describe('isSupported', () => {
    it('should return true when WebAuthn is supported', () => {
      expect(WebAuthnClient.isSupported()).toBe(true);
    });

    it('should return false when PublicKeyCredential is not available', () => {
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: undefined,
        writable: true,
      });
      expect(WebAuthnClient.isSupported()).toBe(false);
    });

    it('should return false when navigator.credentials is not available', () => {
      Object.defineProperty(window.navigator, 'credentials', {
        value: undefined,
        writable: true,
      });
      expect(WebAuthnClient.isSupported()).toBe(false);
    });
  });


  describe('registerPasskey', () => {
    it('should register a new passkey for new user', async () => {
      const { startRegistration } = await import('@simplewebauthn/browser');

      // Mock registration begin response
      mockFetch
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            success: true,
            options: {
              challengeId: 'challenge-123',
              challenge: 'test-challenge',
              rp: { name: 'Hamrah App', id: 'hamrah.app' },
              user: { id: 'user-123', name: 'test@example.com', displayName: 'Test User' },
            },
          }),
        })
        // Mock registration complete response
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            success: true,
          }),
        });

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

      const result = await webauthnClient.registerPasskey({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/webauthn/register/begin', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }));
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/webauthn/register/complete', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }));
    });

    it('should register additional passkey for existing user', async () => {
      const { startRegistration } = await import('@simplewebauthn/browser');

      // Mock registration begin response
      mockFetch
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            success: true,
            options: {
              challengeId: 'challenge-123',
              challenge: 'test-challenge',
              excludeCredentials: [{ id: 'existing-cred', type: 'public-key', transports: ['usb'] }],
            },
          }),
        })
        // Mock registration complete response
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            success: true,
          }),
        });

      // Mock successful registration
      vi.mocked(startRegistration).mockResolvedValue({
        id: 'new-credential-id',
        response: { transports: ['internal'] },
      } as any);

      const result = await webauthnClient.registerPasskey({
        email: 'existing@example.com',
        name: 'Existing User',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/webauthn/register/begin', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }));
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/webauthn/register/complete', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }));
    });

    it('should handle WebAuthn not supported', async () => {
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: undefined,
        writable: true,
      });

      const result = await webauthnClient.registerPasskey({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('WebAuthn is not supported in this browser');
    });

    it('should handle registration failure', async () => {
      const { startRegistration } = await import('@simplewebauthn/browser');

      // Mock registration begin response
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          options: { challengeId: 'challenge-123' },
        }),
      });

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
      const { startAuthentication } = await import('@simplewebauthn/browser');

      // Mock authentication begin response
      mockFetch
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            success: true,
            options: {
              challengeId: 'challenge-123',
              challenge: 'auth-challenge',
              allowCredentials: [{
                id: 'Y3JlZC0x',
                type: 'public-key',
                transports: ['internal'],
              }],
            },
          }),
        })
        // Mock authentication complete response
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            success: true,
            user: { id: 'user-123', email: 'test@example.com' },
            session_token: 'session-123',
          }),
        });

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

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.user).toEqual({ id: 'user-123', email: 'test@example.com' });
      expect(result.session_token).toBe('session-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/webauthn/authenticate/begin', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }));
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/webauthn/authenticate/complete', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }));
    });

    it('should fail when user not found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: false,
          error: 'User not found',
        }),
      });

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'nonexistent@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail when no credentials found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: false,
          error: 'No passkeys found for this user',
        }),
      });

      const result = await webauthnClient.authenticateWithPasskey({
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No passkeys found for this user');
    });

    it('should handle authentication cancellation', async () => {
      const { startAuthentication } = await import('@simplewebauthn/browser');

      mockFetch.mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          options: { challengeId: 'challenge-123' },
        }),
      });

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
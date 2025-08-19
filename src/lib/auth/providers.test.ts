import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyGoogleToken, verifyAppleToken } from './providers';
import { mockFetchResponse } from '../../test/setup';

// Mock jose library
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  importJWK: vi.fn(),
}));

describe('OAuth Provider Token Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('verifyGoogleToken', () => {
    it('should verify valid Google ID token', async () => {
      // Mock Google JWKS response
      const mockJWKS = {
        keys: [
          {
            kid: 'test-key-id',
            kty: 'RSA',
            n: 'test-modulus',
            e: 'AQAB',
          },
        ],
      };

      global.fetch = mockFetchResponse(mockJWKS);

      // Mock JWT verification
      const { jwtVerify, importJWK } = await import('jose');
      vi.mocked(importJWK).mockResolvedValue({} as any);
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: 'google-user-id-123',
          email: 'test@gmail.com',
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg',
        },
      } as any);

      // Mock token with test key ID
      const mockToken = 'header.payload.signature';
      vi.spyOn(global, 'atob').mockReturnValue(JSON.stringify({ kid: 'test-key-id' }));

      const result = await verifyGoogleToken(mockToken);

      expect(result).toEqual({
        email: 'test@gmail.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        providerId: 'google-user-id-123',
      });

      expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/certs');
      expect(jwtVerify).toHaveBeenCalledWith(
        mockToken,
        {},
        {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: 'your-google-client-id',
        }
      );
    });

    it('should reject token with invalid signature', async () => {
      const mockJWKS = {
        keys: [{ kid: 'test-key-id', kty: 'RSA' }],
      };

      global.fetch = mockFetchResponse(mockJWKS);

      const { jwtVerify, importJWK } = await import('jose');
      vi.mocked(importJWK).mockResolvedValue({} as any);
      vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid signature'));

      vi.spyOn(global, 'atob').mockReturnValue(JSON.stringify({ kid: 'test-key-id' }));

      await expect(verifyGoogleToken('invalid.token.signature')).rejects.toThrow('Invalid Google token');
    });

    it('should reject token without email', async () => {
      const mockJWKS = {
        keys: [{ kid: 'test-key-id', kty: 'RSA' }],
      };

      global.fetch = mockFetchResponse(mockJWKS);

      const { jwtVerify, importJWK } = await import('jose');
      vi.mocked(importJWK).mockResolvedValue({} as any);
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: 'google-user-id-123',
          // Missing email
          name: 'Test User',
        },
      } as any);

      vi.spyOn(global, 'atob').mockReturnValue(JSON.stringify({ kid: 'test-key-id' }));

      await expect(verifyGoogleToken('token.without.email')).rejects.toThrow('Invalid Google token');
    });

    it('should handle missing key ID in JWKS', async () => {
      const mockJWKS = {
        keys: [{ kid: 'different-key-id', kty: 'RSA' }],
      };

      global.fetch = mockFetchResponse(mockJWKS);

      vi.spyOn(global, 'atob').mockReturnValue(JSON.stringify({ kid: 'missing-key-id' }));

      await expect(verifyGoogleToken('token.with.missing.key')).rejects.toThrow('Invalid Google token');
    });
  });

  describe('verifyAppleToken', () => {
    it('should verify valid Apple ID token', async () => {
      // Mock Apple JWKS response
      const mockJWKS = {
        keys: [
          {
            kid: 'apple-key-id',
            kty: 'RSA',
            n: 'apple-modulus',
            e: 'AQAB',
          },
        ],
      };

      global.fetch = mockFetchResponse(mockJWKS);

      const { jwtVerify, importJWK } = await import('jose');
      vi.mocked(importJWK).mockResolvedValue({} as any);
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: 'apple-user-id-456',
          email: 'test@privaterelay.appleid.com',
          // Apple doesn't always provide name/picture
        },
      } as any);

      vi.spyOn(global, 'atob').mockReturnValue(JSON.stringify({ kid: 'apple-key-id' }));

      const result = await verifyAppleToken('apple.id.token');

      expect(result).toEqual({
        email: 'test@privaterelay.appleid.com',
        name: undefined,
        picture: undefined,
        providerId: 'apple-user-id-456',
      });

      expect(fetch).toHaveBeenCalledWith('https://appleid.apple.com/auth/keys');
      expect(jwtVerify).toHaveBeenCalledWith(
        'apple.id.token',
        {},
        {
          issuer: 'https://appleid.apple.com',
          audience: 'your-apple-client-id',
        }
      );
    });

    it('should reject invalid Apple token', async () => {
      const mockJWKS = {
        keys: [{ kid: 'apple-key-id', kty: 'RSA' }],
      };

      global.fetch = mockFetchResponse(mockJWKS);

      const { jwtVerify, importJWK } = await import('jose');
      vi.mocked(importJWK).mockResolvedValue({} as any);
      vi.mocked(jwtVerify).mockRejectedValue(new Error('Token expired'));

      vi.spyOn(global, 'atob').mockReturnValue(JSON.stringify({ kid: 'apple-key-id' }));

      await expect(verifyAppleToken('expired.apple.token')).rejects.toThrow('Invalid Apple token');
    });

    it('should handle JWKS fetch failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(verifyGoogleToken('any.token.here')).rejects.toThrow('Invalid Google token');
      await expect(verifyAppleToken('any.apple.token')).rejects.toThrow('Invalid Apple token');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JWT header', async () => {
      vi.spyOn(global, 'atob').mockImplementation(() => {
        throw new Error('Invalid base64');
      });

      await expect(verifyGoogleToken('malformed.token')).rejects.toThrow('Invalid Google token');
      await expect(verifyAppleToken('malformed.token')).rejects.toThrow('Invalid Apple token');
    });

    it('should handle invalid JSON in JWT header', async () => {
      vi.spyOn(global, 'atob').mockReturnValue('invalid-json');

      await expect(verifyGoogleToken('invalid.header.token')).rejects.toThrow('Invalid Google token');
      await expect(verifyAppleToken('invalid.header.token')).rejects.toThrow('Invalid Apple token');
    });
  });
});
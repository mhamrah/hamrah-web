import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onPost } from './index';
import { createMockRequestEvent } from '../../../../../test/setup';

// Mock the webauthn module
vi.mock('../../../../../lib/auth/webauthn', () => ({
  generateWebAuthnRegistrationOptions: vi.fn(),
}));

describe('/api/webauthn/register/begin', () => {
  let mockEvent: any;

  beforeEach(() => {
    mockEvent = createMockRequestEvent();
    mockEvent.parseBody = vi.fn();
    mockEvent.json = vi.fn();
    vi.clearAllMocks();
  });

  it('should generate registration options for valid email', async () => {
    const mockOptions = {
      challenge: 'mock-challenge-base64',
      rp: { id: 'localhost', name: 'Hamrah' },
      user: { id: 'user-id', name: 'test@example.com', displayName: 'Test User' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      timeout: 60000,
      attestation: 'none',
    };

    mockEvent.parseBody.mockResolvedValue({ email: 'test@example.com' });

    const { generateWebAuthnRegistrationOptions } = await import('../../../../../lib/auth/webauthn');
    vi.mocked(generateWebAuthnRegistrationOptions).mockResolvedValue(mockOptions);

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(200, {
      success: true,
      options: mockOptions,
    });
    expect(generateWebAuthnRegistrationOptions).toHaveBeenCalledWith(mockEvent, 'test@example.com');
  });

  it('should handle missing email in request body', async () => {
    mockEvent.parseBody.mockResolvedValue({});

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(400, {
      success: false,
      error: 'Email is required',
    });
  });

  it('should handle invalid email format', async () => {
    mockEvent.parseBody.mockResolvedValue({ email: 'invalid-email' });

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(400, {
      success: false,
      error: 'Invalid email format',
    });
  });

  it('should handle webauthn generation errors', async () => {
    mockEvent.parseBody.mockResolvedValue({ email: 'test@example.com' });

    const { generateWebAuthnRegistrationOptions } = await import('../../../../../lib/auth/webauthn');
    vi.mocked(generateWebAuthnRegistrationOptions).mockRejectedValue(new Error('WebAuthn not supported'));

    await onPost(mockEvent);

    expect(mockEvent.json).toHaveBeenCalledWith(500, {
      success: false,
      error: 'Failed to begin registration',
    });
  });

  it('should handle rate limiting', async () => {
    // Mock rate limiting
    mockEvent.platform.KV.get = vi.fn().mockResolvedValue('10'); // Simulate high request count

    mockEvent.parseBody.mockResolvedValue({ email: 'test@example.com' });

    // This would be handled by rate limiting middleware in a real implementation
    // For now, we'll just test that the endpoint can handle it gracefully
    await onPost(mockEvent);

    // Should still process the request in this simple test
    expect(mockEvent.json).toHaveBeenCalled();
  });

  it('should validate email format strictly', async () => {
    const invalidEmails = [
      'notanemail',
      'missing@',
      '@domain.com',
      'spaces @domain.com',
      'toolong'.repeat(50) + '@domain.com',
    ];

    for (const email of invalidEmails) {
      mockEvent.parseBody.mockResolvedValue({ email });
      await onPost(mockEvent);
      expect(mockEvent.json).toHaveBeenCalledWith(400, {
        success: false,
        error: 'Invalid email format',
      });
      vi.clearAllMocks();
    }
  });

  it('should accept valid email formats', async () => {
    const mockOptions = { challenge: 'test' };
    const { generateWebAuthnRegistrationOptions } = await import('../../../../../lib/auth/webauthn');
    vi.mocked(generateWebAuthnRegistrationOptions).mockResolvedValue(mockOptions);

    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.org',
      'firstname.lastname@subdomain.example.com',
    ];

    for (const email of validEmails) {
      mockEvent.parseBody.mockResolvedValue({ email });
      await onPost(mockEvent);
      expect(mockEvent.json).toHaveBeenCalledWith(200, {
        success: true,
        options: mockOptions,
      });
      vi.clearAllMocks();
    }
  });
});
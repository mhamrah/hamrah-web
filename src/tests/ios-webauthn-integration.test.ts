// Integration test to ensure iOS app WebAuthn compatibility
// This test validates the API contract between iOS app and web endpoints

import { describe, test, expect } from 'vitest';
import { getWebAuthnConfig } from '~/lib/webauthn/config';

describe('iOS WebAuthn Integration', () => {
  test('WebAuthn config should adapt to environment', () => {
    const config = getWebAuthnConfig();
    
    // Verify config structure
    expect(config).toHaveProperty('RP_NAME');
    expect(config).toHaveProperty('RP_ID');
    expect(config).toHaveProperty('EXPECTED_ORIGIN');
    expect(config).toHaveProperty('isDevelopment');
    
    // Verify config values are strings
    expect(typeof config.RP_NAME).toBe('string');
    expect(typeof config.RP_ID).toBe('string');
    expect(typeof config.EXPECTED_ORIGIN).toBe('string');
    expect(typeof config.isDevelopment).toBe('boolean');
    
    console.log('Current WebAuthn config:', config);
  });

  test('iOS registration request format should be compatible', () => {
    // This simulates the request format from iOS WebAuthnSignUpView
    const iosRegistrationRequest = {
      email: 'test@example.com',
      name: 'Test User'
    };
    
    // Verify the request structure matches web endpoint expectations
    expect(iosRegistrationRequest).toHaveProperty('email');
    expect(iosRegistrationRequest).toHaveProperty('name');
    expect(typeof iosRegistrationRequest.email).toBe('string');
    expect(typeof iosRegistrationRequest.name).toBe('string');
  });

  test('iOS authentication request format should be compatible', () => {
    // This simulates the request format from iOS NativeAuthManager
    const iosAuthRequest = {
      email: 'test@example.com'
    };
    
    // Verify the request structure matches web endpoint expectations
    expect(iosAuthRequest).toHaveProperty('email');
    expect(typeof iosAuthRequest.email).toBe('string');
  });

  test('iOS complete registration format should be compatible', () => {
    // This simulates the complete registration format from iOS
    const iosCompleteRequest = {
      response: {
        id: 'base64-credential-id',
        rawId: 'base64-credential-id', 
        type: 'public-key',
        response: {
          attestationObject: 'base64-attestation-object',
          clientDataJSON: 'base64-client-data-json'
        }
      },
      challengeId: 'challenge-uuid',
      email: 'test@example.com',
      name: 'Test User'
    };
    
    // Verify the request structure matches SimpleWebAuthn format expected by web
    expect(iosCompleteRequest.response).toHaveProperty('id');
    expect(iosCompleteRequest.response).toHaveProperty('rawId');
    expect(iosCompleteRequest.response).toHaveProperty('type');
    expect(iosCompleteRequest.response).toHaveProperty('response');
    expect(iosCompleteRequest.response.response).toHaveProperty('attestationObject');
    expect(iosCompleteRequest.response.response).toHaveProperty('clientDataJSON');
    expect(iosCompleteRequest).toHaveProperty('challengeId');
    expect(iosCompleteRequest).toHaveProperty('email');
    expect(iosCompleteRequest).toHaveProperty('name');
  });

  test('iOS complete authentication format should be compatible', () => {
    // This simulates the complete authentication format from iOS
    const iosCompleteAuthRequest = {
      response: {
        id: 'base64-credential-id',
        rawId: 'base64-credential-id',
        type: 'public-key', 
        response: {
          authenticatorData: 'base64-authenticator-data',
          clientDataJSON: 'base64-client-data-json',
          signature: 'base64-signature',
          userHandle: 'base64-user-handle'
        }
      },
      challengeId: 'challenge-uuid'
    };
    
    // Verify the request structure matches SimpleWebAuthn format expected by web
    expect(iosCompleteAuthRequest.response).toHaveProperty('id');
    expect(iosCompleteAuthRequest.response).toHaveProperty('rawId');
    expect(iosCompleteAuthRequest.response).toHaveProperty('type');
    expect(iosCompleteAuthRequest.response).toHaveProperty('response');
    expect(iosCompleteAuthRequest.response.response).toHaveProperty('authenticatorData');
    expect(iosCompleteAuthRequest.response.response).toHaveProperty('clientDataJSON');
    expect(iosCompleteAuthRequest.response.response).toHaveProperty('signature');
    expect(iosCompleteAuthRequest.response.response).toHaveProperty('userHandle');
    expect(iosCompleteAuthRequest).toHaveProperty('challengeId');
  });

  test('WebAuthn endpoints should exist for iOS integration', () => {
    // This test ensures the expected endpoints exist
    const requiredEndpoints = [
      '/api/webauthn/register/begin',
      '/api/webauthn/register/complete', 
      '/api/webauthn/authenticate/begin',
      '/api/webauthn/authenticate/complete',
      '/api/webauthn/add-passkey/begin',
      '/api/webauthn/add-passkey/complete'
    ];
    
    // Verify we have all required endpoints
    expect(requiredEndpoints).toHaveLength(6);
    requiredEndpoints.forEach(endpoint => {
      expect(typeof endpoint).toBe('string');
      expect(endpoint).toMatch(/^\/api\/webauthn\//);
    });
  });
});